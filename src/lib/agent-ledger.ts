import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from './prisma'

// Registro del equipo de agentes: qué hizo cada uno, cuánto gastó de IA, ajustes y lecciones.

export type AgentKey = 'juan' | 'fernanda' | 'felipe' | 'samantha' | 'maria' | 'isabel' | 'tomas' | 'jarvis' | 'monitor' | 'system'

export const AGENT_INFO: Record<AgentKey, { name: string; role: string; emoji: string }> = {
  juan: { name: 'Juan', role: 'Investigador de temas y noticias', emoji: '🔎' },
  fernanda: { name: 'Fernanda', role: 'Redactora de contenido', emoji: '✍️' },
  felipe: { name: 'Felipe', role: 'Verificador de datos y cumplimiento', emoji: '✅' },
  samantha: { name: 'Samantha', role: 'Analista de métricas', emoji: '📊' },
  maria: { name: 'María', role: 'Comunidad: respuestas a comentarios', emoji: '💬' },
  isabel: { name: 'Isabel', role: 'Finanzas: fechas de impuestos', emoji: '🧾' },
  tomas: { name: 'Tomás', role: 'Video: guiones para reels', emoji: '🎬' },
  jarvis: { name: 'Jarvis', role: 'Asistente personal', emoji: '🤖' },
  monitor: { name: 'Monitoreo', role: 'Vigila que las apps funcionen', emoji: '🛰️' },
  system: { name: 'Sistema', role: 'Otras tareas de IA', emoji: '⚙️' },
}
/** Agentes que se pueden apagar o ajustar desde la pantalla. */
export const TOGGLEABLE: AgentKey[] = ['juan', 'fernanda', 'felipe', 'samantha']

interface Ctx { agent: AgentKey; companyId?: string }
const store = new AsyncLocalStorage<Ctx>()

/** Todo lo que corra dentro de `fn` se anota (gasto y actividad) a nombre de este agente. */
export function runAs<T>(agent: AgentKey, fn: () => Promise<T>, companyId?: string): Promise<T> {
  return store.run({ agent, companyId }, fn)
}
export const currentAgent = (): AgentKey => store.getStore()?.agent ?? 'system'

// Precios aproximados en USD por millón de tokens (entrada/salida). Búsqueda web: ~$0,01 cada una.
const PRICES: [RegExp, number, number][] = [
  [/haiku/i, 1, 5],
  [/opus/i, 15, 75],
  [/sonnet/i, 3, 15],
]
export function estimateCost(model: string, input: number, output: number, searches: number): number {
  const [, pi, po] = PRICES.find(([re]) => re.test(model)) ?? [/./, 3, 15]
  return (input * pi + output * po) / 1_000_000 + searches * 0.01
}

const dayKey = (d = new Date()) => new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) // día en Colombia

export async function recordUsage(model: string, usage: { input: number; output: number; searches: number }) {
  try {
    const agent = currentAgent()
    const cost = estimateCost(model, usage.input, usage.output, usage.searches)
    await prisma.agentUsage.upsert({
      where: { agent_model_day: { agent, model, day: dayKey() } },
      create: { agent, model, day: dayKey(), calls: 1, inputTokens: usage.input, outputTokens: usage.output, searches: usage.searches, costUsd: cost },
      update: { calls: { increment: 1 }, inputTokens: { increment: usage.input }, outputTokens: { increment: usage.output }, searches: { increment: usage.searches }, costUsd: { increment: cost } },
    })
  } catch { /* el registro de gasto nunca debe romper una llamada */ }
}

export async function logActivity(agent: AgentKey, kind: string, summary: string, opts: { companyId?: string | null; detail?: unknown } = {}) {
  try {
    await prisma.agentActivity.create({ data: { agent, kind, summary: summary.slice(0, 400), companyId: opts.companyId ?? null, detail: (opts.detail ?? undefined) as never } })
  } catch { /* idem */ }
}

// ── Ajustes (con caché de 60 s para no consultar la base en cada llamada de IA) ──
type Setting = { enabled: boolean; modelTier: string }
let cache: { at: number; map: Map<string, Setting> } | null = null
async function settings(): Promise<Map<string, Setting>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.map
  const map = new Map<string, Setting>()
  try { for (const r of await prisma.agentSetting.findMany()) map.set(r.agent, { enabled: r.enabled, modelTier: r.modelTier }) } catch { /* sin ajustes: todo por defecto */ }
  cache = { at: Date.now(), map }
  return map
}
export function clearSettingsCache() { cache = null }

export async function agentEnabled(agent: AgentKey): Promise<boolean> {
  return (await settings()).get(agent)?.enabled ?? true
}
/** Nivel de modelo elegido para el agente actual: 'smart', 'cheap' o 'default'. */
export async function currentTier(): Promise<string> {
  return (await settings()).get(currentAgent())?.modelTier ?? 'default'
}

// ── Presupuesto mensual de IA ──
export class AiBudgetError extends Error {
  readonly name = 'AiBudgetError'
  constructor(readonly spent: number, readonly limit: number) {
    super(`Se llegó al tope de IA de este mes ($${spent.toFixed(2)} de $${limit.toFixed(2)}).`)
  }
}
const DEFAULT_BUDGET = Number(process.env.AI_MONTHLY_BUDGET_USD) > 0 ? Number(process.env.AI_MONTHLY_BUDGET_USD) : 5

export async function monthSpend(): Promise<number> {
  const rows = await prisma.agentUsage.aggregate({ _sum: { costUsd: true }, where: { day: { gte: dayKey().slice(0, 8) + '01' } } })
  return rows._sum.costUsd ?? 0
}
export async function monthlyBudget(): Promise<number> {
  try {
    const row = await prisma.agentSetting.findUnique({ where: { agent: 'budget' } })
    return row?.budgetUsd && row.budgetUsd > 0 ? row.budgetUsd : DEFAULT_BUDGET
  } catch { return DEFAULT_BUDGET }
}
let budgetCache: { at: number; spent: number; limit: number } | null = null
export function clearBudgetCache() { budgetCache = null }
export async function budgetStatus(): Promise<{ spent: number; limit: number }> {
  if (budgetCache && Date.now() - budgetCache.at < 30_000) return budgetCache
  const [spent, limit] = await Promise.all([monthSpend().catch(() => 0), monthlyBudget()])
  budgetCache = { at: Date.now(), spent, limit }
  return budgetCache
}
/** Lanza AiBudgetError si el gasto del mes ya llegó al tope. */
export async function assertBudget(): Promise<void> {
  const { spent, limit } = await budgetStatus()
  if (spent >= limit) throw new AiBudgetError(spent, limit)
}
