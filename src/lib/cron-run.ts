import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendCronFailureEmail } from '@/lib/sendgrid-client'

// No repetir el aviso de un mismo job que sigue fallando.
const FAILURE_EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000

type CronHandler = (req: Request) => Promise<NextResponse>

async function finish(runId: string, ok: boolean, summary: unknown, error: string | null) {
  await prisma.cronRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), ok, summary: (summary ?? undefined) as never, error },
  })
}

async function notifyFailure(job: string, runId: string, error: string) {
  const recentFailure = await prisma.cronRun.findFirst({
    where: { job, ok: false, id: { not: runId }, startedAt: { gte: new Date(Date.now() - FAILURE_EMAIL_COOLDOWN_MS) } },
    select: { id: true },
  })
  if (recentFailure) return
  const sent = await sendCronFailureEmail({ job, error })
  if (!sent.success) console.error(`[cron-run] aviso de falla de "${job}" no enviado:`, sent.error)
}

/**
 * Ejecuta el trabajo de un cron dejando constancia en CronRun (ok/falló, resumen,
 * error) y avisando por correo si falla. Úsalo desde los handlers HTTP y desde el
 * scheduler interno.
 */
export async function runLogged<T>(job: string, fn: () => Promise<T>): Promise<T> {
  const run = await prisma.cronRun.create({ data: { job } }).catch(() => null)
  try {
    const result = await fn()
    if (run) await finish(run.id, true, result, null).catch(() => {})
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (run) {
      await finish(run.id, false, null, msg).catch(() => {})
      await notifyFailure(job, run.id, msg).catch(() => {})
    }
    throw err
  }
}

/**
 * Envuelve un handler de cron HTTP. Los rechazos de autenticación (401/403) no se
 * registran: no son corridas reales y llenarían la bitácora de ruido.
 */
export function withCronLog(job: string, handler: CronHandler): CronHandler {
  return async (req) => {
    const startedAt = new Date()
    let res: NextResponse
    try {
      res = await handler(req)
    } catch (err) {
      await logHttp(job, startedAt, false, null, err instanceof Error ? err.message : String(err))
      throw err
    }
    if (res.status === 401 || res.status === 403) return res

    const ok = res.status < 400
    let body: unknown = null
    try { body = await res.clone().json() } catch { /* cuerpo no JSON */ }
    const error = ok ? null : (typeof (body as { error?: unknown } | null)?.error === 'string' ? (body as { error: string }).error : `HTTP ${res.status}`)
    await logHttp(job, startedAt, ok, body, error)
    return res
  }
}

async function logHttp(job: string, startedAt: Date, ok: boolean, summary: unknown, error: string | null) {
  try {
    const run = await prisma.cronRun.create({
      data: { job, startedAt, finishedAt: new Date(), ok, summary: (summary ?? undefined) as never, error },
    })
    if (!ok && error) await notifyFailure(job, run.id, error)
  } catch (err) {
    console.error(`[cron-run] no se pudo registrar la corrida de "${job}":`, err)
  }
}
