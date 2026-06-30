import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendAgentAlertEmail } from '@/lib/sendgrid-client';

export const dynamic = 'force-dynamic';

const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 horas — evita spam si sigue caído
const CACHE_MAX_AGE = 1800; // 30 minutos en segundos

// Module-level cooldown: appId → timestamp del último email enviado.
// Funciona porque Railway corre un proceso Node persistente (no serverless).
const lastAlertSent = new Map<string, number>();

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
      uptime: data.uptime ?? null,
      errorRate: data.errorRate ?? null,
      consecutiveFailures: data.consecutiveFailures ?? 0,
      databaseConnected: data.databaseConnected ?? true,
      memoryUsage: data.memoryUsage ?? null,
      cpuUsage: data.cpuUsage ?? null,
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
        return {
          id: app.id,
          name: app.name,
          agentName: app.agentName,
          ...health,
          message: health.status === 'down' ? 'Health check failed' : null,
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
        })),
      });
    } catch (logError) {
      console.error('Failed to persist agent health log:', logError);
    }

    // Enviar email si algún agente está down/degraded (con cooldown de 4h)
    for (const result of results) {
      if (result.status === 'down' || result.status === 'degraded') {
        const lastSent = lastAlertSent.get(result.id) ?? 0;
        if (Date.now() - lastSent > ALERT_COOLDOWN_MS) {
          lastAlertSent.set(result.id, Date.now());
          sendAgentAlertEmail({
            agentName: result.agentName,
            appName: result.name,
            status: result.status,
            latency: result.latency,
          }).catch((err) => console.error('[email] Alert failed:', err));
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
          // Cacheable 30 min en el browser, no en CDN/proxy
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
