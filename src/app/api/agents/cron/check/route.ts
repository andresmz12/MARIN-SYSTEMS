import { NextResponse } from 'next/server'
import { runAgentChecks } from '@/lib/agent-monitor'
import { withCronLog } from '@/lib/cron-run'
import { isQuietHours } from '@/lib/quiet-hours'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Disparador externo del monitoreo (cron-job.org, UptimeRobot, GitHub Actions...).
// El servidor ya se chequea solo (src/lib/agent-scheduler.ts); esto sirve de respaldo
// desde fuera por si el proceso se queda sin scheduler.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (isQuietHours()) return NextResponse.json({ checked: 0, skipped: 'descanso nocturno (11 PM - 7 AM Colombia)' })
  try {
    const apps = await runAgentChecks()
    return NextResponse.json({
      checked: apps.length,
      apps: apps.map((a) => ({ agent: a.agentName, status: a.status, streak: a.consecutiveFailures })),
    })
  } catch (err) {
    console.error('[agents/cron/check]', err)
    return NextResponse.json({ error: 'Error chequeando los agentes' }, { status: 500 })
  }
}

export const POST = withCronLog('agent-check', handler)
