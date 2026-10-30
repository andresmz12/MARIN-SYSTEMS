// Empareja una publicación leída de Facebook/Instagram/LinkedIn (por Make) con un post nuestro, sin necesitar su ID:
// 1) mismo enlace, 2) mismo inicio de texto, 3) misma fecha si solo hay un candidato ese día.

export interface MetricItem {
  permalink?: string
  text?: string
  publishedAt?: string
  reach?: number | null
  impressions?: number | null
  likes?: number | null
  comments?: number | null
  shares?: number | null
  saves?: number | null
  clicks?: number | null
}
export interface Candidate { id: string; copy: string; externalUrl: string | null; publishedAt: Date | null }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const url = (u: string) => u.replace(/^https?:\/\/(www\.|m\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
const START = 50

export function matchPost(item: MetricItem, cands: Candidate[]): Candidate | null {
  if (item.permalink) {
    const u = url(item.permalink)
    const hit = cands.find((c) => c.externalUrl && url(c.externalUrl) === u)
    if (hit) return hit
  }
  if (item.text) {
    const t = norm(item.text).slice(0, START)
    if (t.length >= 20) {
      const hits = cands.filter((c) => { const n = norm(c.copy).slice(0, START); return n === t || norm(item.text!).startsWith(n.slice(0, 35)) })
      if (hits.length === 1) return hits[0]
      if (hits.length > 1 && item.publishedAt) {
        const when = new Date(item.publishedAt).getTime()
        return [...hits].sort((a, b) => Math.abs((a.publishedAt?.getTime() ?? 0) - when) - Math.abs((b.publishedAt?.getTime() ?? 0) - when))[0]
      }
    }
  }
  if (item.publishedAt) {
    const when = new Date(item.publishedAt).getTime()
    if (!Number.isNaN(when)) {
      const same = cands.filter((c) => c.publishedAt && Math.abs(c.publishedAt.getTime() - when) < 36 * 3600 * 1000)
      if (same.length === 1) return same[0]
    }
  }
  return null
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}
export const metricFields = (i: MetricItem) => ({
  reach: num(i.reach), impressions: num(i.impressions), likes: num(i.likes), comments: num(i.comments),
  shares: num(i.shares), saves: num(i.saves), clicks: num(i.clicks),
})
