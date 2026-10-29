import { prisma } from '@/lib/prisma'

/**
 * Memoria de temas: todo lo que ya se propuso o se usó (incluye lo rechazado y lo ya publicado) para no
 * repetir el mismo tema de contabilidad, impuestos, etc. aunque venga de otra noticia o con otras palabras.
 */

const HISTORY_DAYS = 365

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
const STOP = new Set(['para', 'como', 'tus', 'sus', 'con', 'que', 'los', 'las', 'del', 'una', 'uno', 'por', 'sobre', 'what', 'your', 'the', 'and', 'for', 'with', 'from', 'that', 'this', 'tax', 'taxes', 'impuestos'])
const words = (t: string) => Array.from(new Set(norm(t).split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w))))

/** Parecido entre dos temas (0 a 1): palabras en común sobre las del más corto. */
export function similarity(a: string, b: string): number {
  const wa = words(a)
  const wb = new Set(words(b))
  if (wa.length === 0 || wb.size === 0) return 0
  const common = wa.filter((w) => wb.has(w)).length
  return common / Math.min(wa.length, wb.size)
}

export function isRepeat(topic: string, past: string[], threshold = 0.6): string | null {
  return past.find((p) => similarity(topic, p) >= threshold) ?? null
}

export interface TopicHistory {
  /** Temas ya usados o propuestos, del más reciente al más antiguo (sin repetidos). */
  topics: string[]
  /** Enlaces de noticias ya usadas. */
  urls: Set<string>
}

/**
 * `openIdeas`: incluir también las ideas propuestas que aún no se usan (el investigador las necesita para no
 * proponerlas otra vez; el redactor NO, porque justo ahora va a escribir una de ellas).
 */
export async function topicHistory(companyId: string, opts: { days?: number; openIdeas?: boolean } = {}): Promise<TopicHistory> {
  const days = opts.days ?? HISTORY_DAYS
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const [posts, angles] = await Promise.all([
    prisma.generatedPost.findMany({
      where: { companyId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      select: { topic: true, sourceUrl: true },
    }),
    prisma.contentAngle.findMany({ where: { companyId, createdAt: { gte: since }, ...(opts.openIdeas ? {} : { status: { not: 'new' } }) }, orderBy: { createdAt: 'desc' }, select: { angle: true } }),
  ])
  const seen = new Set<string>()
  const topics: string[] = []
  for (const t of [...posts.map((p) => p.topic), ...angles.map((a) => a.angle)]) {
    const k = t.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    topics.push(t.trim())
  }
  return { topics, urls: new Set(posts.map((p) => p.sourceUrl).filter((u): u is string => !!u)) }
}

/** Lista compacta para pasársela al redactor/investigador ("no repitas esto"). */
export function avoidList(topics: string[], max = 40): string {
  return topics.slice(0, max).map((t) => (t.length > 90 ? `${t.slice(0, 89)}…` : t)).join('; ')
}
