import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HealthCheckResult {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency: number | null;
  uptime: number | null;
  message: string | null;
}

async function checkAppHealth(healthUrl: string, timeout = 5000): Promise<{
  status: 'healthy' | 'degraded' | 'down';
  latency: number | null;
  uptime: number | null;
}> {
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
      return { status: 'degraded', latency, uptime: null };
    }

    const data = await response.json();

    return {
      status: 'healthy',
      latency,
      uptime: data.uptime ?? null,
    };
  } catch {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      uptime: null,
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
          ...health,
          message: health.status === 'down' ? 'Health check failed' : null,
        } as HealthCheckResult;
      })
    );

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

    return NextResponse.json({
      success: true,
      timestamp: new Date(),
      apps: results,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check app health',
      },
      { status: 500 }
    );
  }
}
