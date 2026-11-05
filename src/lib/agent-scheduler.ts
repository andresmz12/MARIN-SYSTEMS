import { runAgentChecks } from '@/lib/agent-monitor'
import { runLogged } from '@/lib/cron-run'
import { isQuietHours } from '@/lib/quiet-hours'
import { maybeSendHourlyReport, maybeSendMorningReport } from '@/lib/morning-report'
import { hasDuePosts, runPublishDue } from '@/lib/publish-due'

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
  let publishing = false
  let lastPublishCheck = 0
  // Cada cuánto revisar si hay posts vencidos (solo es una consulta a la base de datos, sin IA ni costo). Por defecto, cada 30 min.
  const publishEveryMs = (Number(process.env.PUBLISH_CHECK_MIN) > 0 ? Number(process.env.PUBLISH_CHECK_MIN) : 30) * 60_000
  // Publicación puntual: el cron de GitHub a veces se retrasa horas o se salta una corrida, así que la app misma revisa
  // cada 30 minutos si hay posts aprobados cuya hora ya llegó. Funciona también en las horas de descanso.
  // Es seguro con el cron de GitHub: cada post se reclama de forma atómica y no se publica dos veces.
  const publishTick = async () => {
    if (publishing || Date.now() - lastPublishCheck < publishEveryMs - 30_000) return
    publishing = true
    lastPublishCheck = Date.now()
    try {
      if (!(await hasDuePosts())) return
      await runLogged('publish-due', async () => {
        const res = await runPublishDue()
        const body = (await res.clone().json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(body.error ?? 'Error publicando')
        return body
      })
    } catch (err) {
      console.error('[agent-scheduler] publicación falló:', err)
    } finally {
      publishing = false
    }
  }
  const tick = async () => {
    await publishTick()
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
      if (results) {
        await maybeSendMorningReport(results).catch((err) => console.error('[morning-report]', err))
        await maybeSendHourlyReport(results).catch((err) => console.error('[hourly-report]', err))
      }
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
