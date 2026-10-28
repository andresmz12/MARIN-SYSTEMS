import { prisma } from '@/lib/prisma'

const CHUNK_CHARS = 900
const MAX_CHUNKS = 6
const STOP = new Set(['para', 'como', 'esta', 'este', 'que', 'los', 'las', 'del', 'una', 'uno', 'con', 'por', 'sus', 'and', 'the', 'for'])

const words = (s: string): string[] =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9$%]+/).filter((w) => w.length > 2 && !STOP.has(w))

/** Parte un texto largo en fragmentos por párrafos, de ~900 caracteres. */
export function chunkText(text: string): string[] {
  const out: string[] = []
  let cur = ''
  for (const para of text.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    if (cur && cur.length + p.length > CHUNK_CHARS) { out.push(cur); cur = '' }
    if (p.length > CHUNK_CHARS) {
      for (let i = 0; i < p.length; i += CHUNK_CHARS) out.push(p.slice(i, i + CHUNK_CHARS))
    } else {
      cur = cur ? `${cur}\n\n${p}` : p
    }
  }
  if (cur) out.push(cur)
  return out
}

/** Los fragmentos de la biblioteca que más se parecen a la consulta (coincidencia de palabras). */
export function pickRelevant(docs: { title: string; content: string }[], query: string, max = MAX_CHUNKS): string[] {
  const q = new Set(words(query))
  if (q.size === 0) return []
  const scored: { score: number; text: string }[] = []
  for (const d of docs) {
    for (const chunk of chunkText(d.content)) {
      const cw = new Set(words(`${d.title} ${chunk}`))
      let score = 0
      q.forEach((w) => { if (cw.has(w)) score++ })
      if (score >= 2) scored.push({ score, text: `(${d.title}) ${chunk}` })
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.text)
}

/** Fragmentos de la biblioteca (del usuario) relevantes para un tema, para la empresa dada. */
export async function knowledgeFor(userId: string, companyId: string, query: string): Promise<string[]> {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { userId, OR: [{ companyId: null }, { companyId }] },
    select: { title: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  return pickRelevant(docs, query)
}
