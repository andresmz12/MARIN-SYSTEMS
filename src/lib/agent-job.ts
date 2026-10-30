import { NextResponse } from 'next/server'
import { agentEnabled, logActivity, runAs, type AgentKey } from './agent-ledger'

type Handler = (req: Request) => Promise<NextResponse>
export type ActivityLine = { text: string; companyName?: string }

/**
 * Envuelve un trabajo automático para un agente: respeta si está apagado, anota su gasto de IA
 * y deja en el registro de actividad una línea por empresa con lo que hizo.
 */
export function agentJob(agent: AgentKey, handler: Handler, describe: (data: Record<string, unknown>) => ActivityLine[]): Handler {
  return async (req) => {
    if (!(await agentEnabled(agent))) {
      await logActivity(agent, 'skipped', 'Trabajo omitido: el agente está apagado en Equipo.')
      return NextResponse.json({ skipped: 'agente apagado', summary: [] })
    }
    const res = await runAs(agent, () => handler(req))
    try {
      const data = (await res.clone().json()) as Record<string, unknown>
      for (const l of describe(data)) await logActivity(agent, 'job', l.text)
    } catch { /* si la respuesta no es JSON no hay nada que anotar */ }
    return res
  }
}

type Row = { company?: string; created?: number; skipped?: string; error?: string; news?: number; web?: number; rejected?: string[]; posts?: number }
const rows = (d: Record<string, unknown>): Row[] => (Array.isArray(d.summary) ? (d.summary as Row[]) : [])

export const describeTopics = (d: Record<string, unknown>): ActivityLine[] =>
  rows(d).map((r) => ({ text: r.error ? `No pudo investigar temas para ${r.company}: ${r.error}` : r.created ? `Dejó ${r.created} ideas de temas para ${r.company}` : `Sin ideas nuevas para ${r.company}${r.skipped ? ` (${r.skipped})` : ''}` }))

export const describeNews = (d: Record<string, unknown>): ActivityLine[] =>
  rows(d).map((r) => ({
    text: r.error
      ? `No pudo revisar noticias de ${r.company}: ${r.error}`
      : `Revisó noticias de ${r.company}: ${r.created ? `${r.created} borrador${r.created === 1 ? '' : 'es'} creado${r.created === 1 ? '' : 's'}` : 'ninguna sirvió'}${typeof r.web === 'number' ? `, la web propuso ${r.web}` : ''}${r.rejected?.length ? `, descartó ${r.rejected.length}` : ''}`,
  }))

export const describeContent = (d: Record<string, unknown>): ActivityLine[] =>
  rows(d).map((r) => ({ text: r.error ? `No pudo redactar la tanda de ${r.company}: ${r.error}` : r.created ? `Redactó ${r.created} posts para ${r.company}` : `No redactó posts para ${r.company}${r.skipped ? ` (${r.skipped})` : ''}` }))

export const describeMetrics = (d: Record<string, unknown>): ActivityLine[] =>
  rows(d).map((r) => ({ text: r.error ? `No pudo analizar métricas de ${r.company}: ${r.error}` : r.skipped ? `No analizó métricas de ${r.company}: ${r.skipped}` : `Analizó ${r.posts ?? ''} posts de ${r.company} y mandó el informe` }))

/** Acción manual (botón de la pantalla): anota el gasto a nombre del agente y deja una línea en su actividad si salió bien. */
export function asAgent<A extends unknown[]>(agent: AgentKey, label: string, fn: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    const res = await runAs(agent, () => fn(...a))
    if (res.ok) await logActivity(agent, 'action', label)
    return res
  }
}
