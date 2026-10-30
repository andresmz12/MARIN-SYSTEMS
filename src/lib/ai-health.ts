import { APIError } from '@anthropic-ai/sdk'
import { prisma } from './prisma'

export type AiFailKind = 'budget' | 'credits' | 'rate_limit' | 'overloaded' | 'timeout' | 'auth' | 'no_key' | 'other'

export interface AiFailure {
  kind: AiFailKind
  message: string
}

const MESSAGES: Record<AiFailKind, string> = {
  budget: 'Se llegó al tope de gasto de IA de este mes. Súbelo en Command Center → Equipo → Presupuesto si quieres seguir.',
  credits: 'Anthropic se quedó sin crédito. Recarga saldo en console.anthropic.com → Plans & Billing.',
  rate_limit: 'Se alcanzó el límite de uso de la IA. Espera unos minutos e intenta de nuevo.',
  overloaded: 'La IA está saturada en este momento. Intenta de nuevo en un minuto.',
  timeout: 'La IA tardó demasiado en responder. Intenta de nuevo.',
  auth: 'La clave de Anthropic (ANTHROPIC_API_KEY) no es válida o fue revocada. Revísala en Railway.',
  no_key: 'Falta la clave ANTHROPIC_API_KEY en Railway.',
  other: 'La IA no respondió bien. Intenta de nuevo; si se repite, mira Agentes → corridas.',
}

export function classifyAiError(err: unknown): AiFailure {
  if (err instanceof Error && err.name === 'AiBudgetError') return { kind: 'budget', message: MESSAGES.budget }
  const text = err instanceof Error ? err.message : String(err)
  const status = err instanceof APIError ? (err.status ?? 0) : 0
  let kind: AiFailKind = 'other'
  if (/credit balance|billing|purchase credits/i.test(text)) kind = 'credits'
  else if (status === 401 || status === 403) kind = 'auth'
  else if (status === 429) kind = 'rate_limit'
  else if (status === 529 || status === 503) kind = 'overloaded'
  else if (/timed? ?out|timeout|ETIMEDOUT|aborted/i.test(text)) kind = 'timeout'
  return { kind, message: MESSAGES[kind] }
}

export const failureOf = (kind: AiFailKind): AiFailure => ({ kind, message: MESSAGES[kind] })

/** Anota que la IA falló (para avisar en el Command Center). Nunca lanza error. */
export async function recordAiFailure(f: AiFailure) {
  try {
    await prisma.aiStatus.upsert({
      where: { id: 'main' },
      create: { id: 'main', failAt: new Date(), failKind: f.kind, failMessage: f.message },
      update: { failAt: new Date(), failKind: f.kind, failMessage: f.message },
    })
  } catch { /* el aviso es un extra: no debe romper nada */ }
}

/** Anota que la IA volvió a funcionar (borra el aviso si lo había). */
export async function recordAiOk() {
  try {
    await prisma.aiStatus.updateMany({ where: { id: 'main', failKind: { not: null } }, data: { failKind: null, failMessage: null, okAt: new Date() } })
  } catch { /* idem */ }
}
