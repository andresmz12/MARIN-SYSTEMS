import { runAgentChecks } from '@/lib/agent-monitor'
import { runLogged } from '@/lib/cron-run'
import { isQuietHours } from '@/lib/quiet-hours'
import { maybeSendMorningReport } from '@/lib/morning-report'

// Monitoreo de fondo: chequea los agentes sin necesidad de tener /agentes abierto.
// Railway corre un proceso Node persistente, así que un intervalo en memoria basta.
// Para que avise aunque ESTE proceso se caiga, conviene además un monitor externo
// (UptimeRobot, cron-job.org) apuntando a /api/agents/cron/check.
const DEFAULT_INTERVAL_MIN = 5
const FIRST_RUN_DELAY_MS = 60_000

const globalForScheduler = globalThis as unknown as { __agentSchedulerStarted?: boolean }

export function startAgentScheduler() {
  if (globalForScheduler.__agentSchedulerStarted) return
  const minutes = Number(process.env.AGENT_MONITOR_INTERVAL_MIN ?? DEFAULT_INTERVAL_MIN)
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log('[agent-scheduler] desactivado (AGENT_MONITOR_INTERVAL_MIN=0)')
    return
  }
  globalForScheduler.__agentSchedulerStarted = true

  let running = false
  const tick = async () => {
    if (running) return // un chequeo lento no se solapa con el siguiente
    if (isQuietHours()) return // descanso nocturno (11 PM - 7 AM Colombia): no vigila ni manda correos
    running = true
    try {
      // Las corridas OK del scheduler no se registran en CronRun (serían ~288 al día);
      // solo las fallas, para que aparezcan en el panel y avisen por correo.
      const results = await runAgentChecks().catch((err) => {
        void runLogged('agent-check', async () => { throw err }).catch(() => {})
        return null
      })
      if (results) await maybeSendMorningReport(results).catch((err) => console.error('[morning-report]', err))
    } finally {
      running = false
    }
  }

  setTimeout(() => {
    void tick()
    setInterval(() => void tick(), minutes * 60_000).unref?.()
  }, FIRST_RUN_DELAY_MS).unref?.()
  console.log(`[agent-scheduler] activo: cada ${minutes} min`)
}
