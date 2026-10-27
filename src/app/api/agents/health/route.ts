import { NextRequest, NextResponse } from 'next/server';
import { runAgentChecks } from '@/lib/agent-monitor';

export const dynamic = 'force-dynamic';

// Shorter than POLL_INTERVAL (15 min) so the cache expires before the next interval tick fires,
// ensuring every setInterval call reaches the server and runs a real health check.
const CACHE_MAX_AGE = 840; // 14 minutos

// Chequeo bajo demanda para la UI de /agentes. El monitoreo de fondo (alertas por
// correo) corre aparte, en el scheduler del servidor y en /api/agents/cron/check.
export async function GET(_req: NextRequest) {
  try {
    const apps = await runAgentChecks();
    return NextResponse.json(
      { success: true, timestamp: new Date(), apps },
      { headers: { 'Cache-Control': `private, max-age=${CACHE_MAX_AGE}` } }
    );
  } catch (err) {
    console.error('Failed to check app health:', err);
    return NextResponse.json({ success: false, error: 'Failed to check app health' }, { status: 500 });
  }
}
