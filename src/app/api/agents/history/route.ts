import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDayStart, getDayEnd } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface LogRow {
  checkedAt: Date;
  status: string;
  latency: number | null;
  uptime: number | null;
  errorRate: number | null;
  memoryUsage: number | null;
  cpuUsage: number | null;
  databaseConnected: boolean | null;
}

function computeStats(rangeLogs: LogRow[], todayLogs: LogRow[]) {
  let changesToday = 0;
  for (let i = 1; i < todayLogs.length; i++) {
    if (todayLogs[i].status !== todayLogs[i - 1].status) changesToday++;
  }

  const peakLatencyToday = todayLogs.reduce<number | null>((max, l) => {
    if (l.latency == null) return max;
    return max == null ? l.latency : Math.max(max, l.latency);
  }, null);

  let trend: 'up' | 'down' | 'stable' = 'stable';
  const withLatency = rangeLogs.filter((l) => l.latency != null);
  if (withLatency.length >= 2) {
    const latest = withLatency[withLatency.length - 1].latency as number;
    const prevSlice = withLatency.slice(-6, -1);
    if (prevSlice.length > 0) {
      const avgPrev =
        prevSlice.reduce((sum, l) => sum + (l.latency as number), 0) / prevSlice.length;
      if (avgPrev > 0) {
        if (latest > avgPrev * 1.15) trend = 'up';
        else if (latest < avgPrev * 0.85) trend = 'down';
      }
    }
  }

  return { changesToday, peakLatencyToday, trend };
}

function computeTransitions(logs: LogRow[]) {
  const transitions: { checkedAt: Date; from: string; to: string }[] = [];
  for (let i = 1; i < logs.length; i++) {
    if (logs[i].status !== logs[i - 1].status) {
      transitions.push({
        checkedAt: logs[i].checkedAt,
        from: logs[i - 1].status,
        to: logs[i].status,
      });
    }
  }
  return transitions;
}

async function buildAppHistory(appId: string, since: Date, dayStart: Date, dayEnd: Date) {
  const [logs, todayLogs, lastFailure] = await Promise.all([
    prisma.agentHealthLog.findMany({
      where: { appId, checkedAt: { gte: since } },
      orderBy: { checkedAt: 'asc' },
    }),
    prisma.agentHealthLog.findMany({
      where: { appId, checkedAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { checkedAt: 'asc' },
    }),
    prisma.agentHealthLog.findFirst({
      where: { appId, status: 'down' },
      orderBy: { checkedAt: 'desc' },
    }),
  ]);

  const stats = computeStats(logs, todayLogs);

  return {
    points: logs.map((l) => ({
      checkedAt: l.checkedAt,
      status: l.status,
      latency: l.latency,
      uptime: l.uptime,
      errorRate: l.errorRate,
      memoryUsage: l.memoryUsage,
      cpuUsage: l.cpuUsage,
      databaseConnected: l.databaseConnected,
    })),
    transitions: computeTransitions(logs),
    stats: {
      ...stats,
      lastFailureAt: lastFailure?.checkedAt ?? null,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const appId = searchParams.get('appId');
    const hours = Number(searchParams.get('hours')) || 6;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const dayStart = getDayStart();
    const dayEnd = getDayEnd();

    if (appId) {
      const history = await buildAppHistory(appId, since, dayStart, dayEnd);
      return NextResponse.json({ success: true, appId, hours, ...history });
    }

    const apps = await prisma.monitoredApp.findMany({ select: { id: true } });
    const results = await Promise.all(
      apps.map(async (app) => {
        const history = await buildAppHistory(app.id, since, dayStart, dayEnd);
        return { appId: app.id, points: history.points, stats: history.stats };
      })
    );

    return NextResponse.json({ success: true, hours, apps: results });
  } catch (error) {
    console.error('History endpoint error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch agent history' },
      { status: 500 }
    );
  }
}
