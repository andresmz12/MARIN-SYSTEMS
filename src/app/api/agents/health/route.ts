import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendAgentAlertEmail } from '@/lib/sendgrid-client';

export const dynamic = 'force-dynamic';

const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 horas
// Shorter than POLL_INTERVAL (30 min) so the cache expires before the next interval tick fires,
// ensuring every setInterval call reaches the server and runs a real health check.
const CACHE_MAX_AGE = 1500; // 25 minutos

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
      uptime: parseNum(data.uptime),
      errorRate: parseNum(data.errorRate),
      consecutiveFailures: parseNum(data.consecutiveFailures) ?? 0,
      databaseConnected: Boolean(data.databaseConnected ?? true),
      memoryUsage: parseNum(data.memoryUsage),
      cpuUsage: parseNum(data.cpuUsage),
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

    const results = await Promise.all(
      apps.map(async (app) => {
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
        } as HealthCheckResult;
      })
    );

    // Persistir logs
    try {
      await prisma.agentHealthLog.createMany({
        data: results.map((r) => ({
          appId: r.id,
          status: r.status,
          latency: r.latency,
          uptime: r.uptime,
          message: r.message,
          errorRate: r.errorRate,
          memoryUsage: r.memoryUsage,
          cpuUsage: r.cpuUsage,
          databaseConnected: r.databaseConnected,
        })),
      });
    } catch (logError) {
      console.error('Failed to persist agent health log:', logError);
    }

    // Enviar email si algún agente está down/degraded (con cooldown de 4h).
    // Cooldown is set optimistically before send; reset on failure so the next
    // check can retry rather than silently skipping alerts for 4 hours.
    for (const result of results) {
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
        apps: results,
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
