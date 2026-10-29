import { prisma } from '@/lib/prisma'
import { sendMorningStatusEmail } from '@/lib/sendgrid-client'
import { isQuietHours } from '@/lib/quiet-hours'
import type { HealthCheckResult } from '@/lib/agent-monitor'

const JOB = 'monitor-morning'
const COL_OFFSET_MS = 5 * 60 * 60 * 1000

/**
 * Primer chequeo del día (después del descanso de 11 PM a 7 AM): un correo corto con cómo amanecieron las apps,
 * funcionen bien o no. Una sola vez por día: la constancia queda en CronRun, así un reinicio no lo repite.
 */
export async function maybeSendMorningReport(results: HealthCheckResult[]): Promise<void> {
  if (results.length === 0 || isQuietHours()) return
  const now = new Date()
  // Inicio del día en Colombia (medianoche) expresado en UTC.
  const col = new Date(now.getTime() - COL_OFFSET_MS)
  const dayStart = new Date(Date.UTC(col.getUTCFullYear(), col.getUTCMonth(), col.getUTCDate()) + COL_OFFSET_MS)
  const already = await prisma.cronRun.findFirst({ where: { job: JOB, startedAt: { gte: dayStart } }, select: { id: true } })
  if (already) return

  const run = await prisma.cronRun.create({ data: { job: JOB } })
  const sent = await sendMorningStatusEmail({
    apps: results.map((r) => ({ agentName: r.agentName, appName: r.name, status: r.status, latency: r.latency, reason: r.message })),
  })
  await prisma.cronRun.update({
    where: { id: run.id },
    data: { finishedAt: new Date(), ok: sent.success, summary: { apps: results.length, healthy: results.filter((r) => r.status === 'healthy').length } as never, error: sent.success ? null : (sent.error ?? 'No se pudo enviar') },
  })
}
