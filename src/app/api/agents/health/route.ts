import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendAgentAlertEmail } from '@/lib/sendgrid-client';

export const dynamic = 'force-dynamic';

const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 horas
// Shorter than POLL_INTERVAL (5 min) so the cache expires before the next interval tick fires,
// ensuring every setInterval call reaches the server and runs a real health check.
const CACHE_MAX_AGE = 240; // 4 minutos

// Module-level state — works because Railway runs a persistent Node process, not serverless.
// Resets on process restart; acceptable trade-off (cooldown is best-effort, not critical-path).
const lastAlertSent = new Map<string, number>();
// Track consecutive failures ourselves since checkAppHealth can't know the history.
const consecutiveFailuresTracker = new Map<string, number>();

interface HealthCheckResult {
  id: string;
  name: string;
  agentName: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency: number | null;
  uptime: number | null;
  message: string | null;
  errorRate: number | null;
  consecutiveFailures: number;
  databaseConnected: boolean;
  memoryUsage: number | null;
  cpuUsage: number | null;
}

interface AppHealthFields {
  status: 'healthy' | 'degraded' | 'down';
  latency: number | null;
  uptime: number | null;
  errorRate: number | null;
  consecutiveFailures: number;
  databaseConnected: boolean;
  memoryUsage: number | null;
  cpuUsage: number | null;
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function clamp(v: number | null): number | null {
  return v != null ? Math.min(100, Math.max(0, v)) : null;
}

async function checkAppHealth(healthUrl: string, timeout = 5000): Promise<AppHealthFields> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'degraded',
        latency,
        uptime: null,
        errorRate: null,
        consecutiveFailures: 0,
        databaseConnected: true,
        memoryUsage: null,
        cpuUsage: null,
      };
    }

    const data = await response.json();

    return {
      status: 'healthy',
      latency,
      uptime: clamp(parseNum(data.uptime)),
      errorRate: clamp(parseNum(data.errorRate)),
      consecutiveFailures: parseNum(data.consecutiveFailures) ?? 0,
      databaseConnected: Boolean(data.databaseConnected ?? true),
      memoryUsage: clamp(parseNum(data.memoryUsage)),
      cpuUsage: clamp(parseNum(data.cpuUsage)),
    };
  } catch {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      uptime: null,
      errorRate: null,
      consecutiveFailures: 0,
      databaseConnected: false,
      memoryUsage: null,
      cpuUsage: null,
    };
  }
}

export async function GET(_req: NextRequest) {
  try {
    const apps = await prisma.monitoredApp.findMany();

    const results: HealthCheckResult[] = await Promise.all(
      apps.map(async (app: { id: string; name: string; agentName: string; healthUrl: string }) => {
        const health = await checkAppHealth(app.healthUrl);

        // Track consecutive failures server-side so the UI badge triggers correctly
        // even for apps that are unreachable (which always return consecutiveFailures:0).
        if (health.status === 'down' || health.status === 'degraded') {
          consecutiveFailuresTracker.set(app.id, (consecutiveFailuresTracker.get(app.id) ?? 0) + 1);
        } else {
          consecutiveFailuresTracker.set(app.id, 0);
        }

        const trackedFailures = consecutiveFailuresTracker.get(app.id) ?? 0;

        return {
          id: app.id,
          name: app.name,
          agentName: app.agentName,
          ...health,
          consecutiveFailures: Math.max(health.consecutiveFailures, trackedFailures),
          message: health.status === 'down'
            ? 'Health check failed'
            : health.status === 'degraded'
            ? 'Service degraded — non-2xx response'
            : null,
        };
      })
    );

    // Compute uptime from last 24h logs for apps whose endpoint didn't report it.
    // Done BEFORE persisting so: (a) the current check isn't counted yet (no pessimism),
    // (b) the persisted log row gets the computed value instead of null.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const computedUptimeMap = new Map<string, number>();
    await Promise.all(
      results
        .filter((r) => r.uptime == null)
        .map(async (r) => {
          const logs = await prisma.agentHealthLog.findMany({
            where: { appId: r.id, checkedAt: { gte: since24h } },
            select: { status: true },
          });
          if (logs.length > 0) {
            const healthyCount = logs.filter((l: { status: string }) => l.status === 'healthy').length;
            computedUptimeMap.set(r.id, (healthyCount / logs.length) * 100);
          }
        })
    );

    const enrichedResults: HealthCheckResult[] = results.map((r) => ({
      ...r,
      uptime: r.uptime ?? computedUptimeMap.get(r.id) ?? null,
    }));

    // Persistir logs con el uptime ya enriquecido
    try {
      await prisma.agentHealthLog.createMany({
        data: enrichedResults.map((r) => ({
          appId: r.id,
          status: r.status,
          latency: r.latency,
          uptime: r.uptime,
          message: r.message,
        })),
      });
    } catch (logError) {
      console.error('Failed to persist agent health log:', logError);
    }

    // Enviar email si algún agente está down/degraded (con cooldown de 4h).
    // Cooldown is set optimistically before send; reset on failure so the next
    // check can retry rather than silently skipping alerts for 4 hours.
    for (const result of enrichedResults) {
      if (result.status === 'down' || result.status === 'degraded') {
        const lastSent = lastAlertSent.get(result.id) ?? 0;
        if (Date.now() - lastSent > ALERT_COOLDOWN_MS) {
          const alertTime = Date.now();
          lastAlertSent.set(result.id, alertTime);
          sendAgentAlertEmail({
            agentName: result.agentName,
            appName: result.name,
            status: result.status,
            latency: result.latency,
          })
            .then((r) => {
              if (!r.success) {
                console.error('[email] Alert failed for', result.agentName, '—', r.error);
                // Reset cooldown so the next poll retries
                if (lastAlertSent.get(result.id) === alertTime) {
                  lastAlertSent.delete(result.id);
                }
              }
            })
            .catch((err) => {
              console.error('[email] Alert threw for', result.agentName, err);
              if (lastAlertSent.get(result.id) === alertTime) {
                lastAlertSent.delete(result.id);
              }
            });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date(),
        apps: enrichedResults,
      },
      {
        headers: {
          'Cache-Control': `private, max-age=${CACHE_MAX_AGE}`,
        },
      }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to check app health' },
      { status: 500 }
    );
  }
}
