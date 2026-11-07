import { BlogApiError, blogEnvName, createBlogDraftRetry, resolveBlogTarget, type BlogPostCreated } from '@/lib/blog-api'
import { parseArticles, withLegalNote, type ImportResult } from '@/lib/blog-import'
import { logActivity } from '@/lib/agent-ledger'
import { prisma } from '@/lib/prisma'
import { isRepeat } from '@/lib/topic-memory'

// Cola de artículos del blog escritos por el dueño: se guardan "listos" y se mandan como borrador, uno por semana (o a mano).

const urlOf = (t: string) => t.match(/https?:\/\/\S+/)?.[0]
function ctaFor(locale: string, es?: string | null, en?: string | null): string {
  if (locale === 'es') return (es ?? '').trim()
  if ((en ?? '').trim()) return en!.trim()
  const link = urlOf(es ?? '')
  return /whatsapp/i.test(es ?? '') && link ? `Request a demo on WhatsApp: ${link}` : (es ?? '').trim()
}

export async function importBlogArticles(companyId: string, text: string): Promise<ImportResult & { saved: number }> {
  const parsed = parseArticles(text)
  const profile = await prisma.brandProfile.findFirst({ where: { companyId } })
  const last = await prisma.blogArticle.aggregate({ _max: { position: true }, where: { companyId } })
  let position = (last._max.position ?? 0)
  const positions = new Map<string, number>()
  const topics = await prisma.blogTopic.findMany({ where: { companyId, status: 'pending' } })
  let saved = 0
  for (const a of parsed.articles) {
    const existing = await prisma.blogArticle.findUnique({ where: { companyId_locale_translationKey: { companyId, locale: a.locale, translationKey: a.translationKey } } })
    if (existing?.status === 'sent') { parsed.warnings.push(`«${a.title.slice(0, 50)}» (${a.locale.toUpperCase()}) ya se envió al blog: no se cambió.`); continue }
    if (!positions.has(a.translationKey)) positions.set(a.translationKey, existing?.position ?? ++position)
    const { content, isLegal } = withLegalNote(a)
    const cta = ctaFor(a.locale, profile?.blogCta, profile?.blogCtaEn)
    const data = { title: a.title, description: a.description, slug: a.slug, tags: a.tags, content: cta ? `${content}\n\n---\n\n${cta}` : content, isLegal, status: 'ready', position: positions.get(a.translationKey)! }
    if (existing) await prisma.blogArticle.update({ where: { id: existing.id }, data })
    else await prisma.blogArticle.create({ data: { companyId, locale: a.locale, translationKey: a.translationKey, ...data } })
    saved++
    if (a.locale === 'es') {
      const t = topics.find((x) => isRepeat(a.title, [x.title]) || isRepeat(x.title, [a.title]))
      if (t) await prisma.blogTopic.update({ where: { id: t.id }, data: { status: 'used', usedAt: new Date(), articleSlug: a.slug } })
    }
  }
  return { ...parsed, saved }
}

export interface QueueItem { key: string; position: number; title: string; es: boolean; en: boolean; status: string; isLegal: boolean; words: number; urls: string[]; preview: string }

export async function listQueue(companyId: string): Promise<QueueItem[]> {
  const rows = await prisma.blogArticle.findMany({ where: { companyId }, orderBy: [{ position: 'asc' }, { locale: 'asc' }] })
  const byKey = new Map<string, typeof rows>()
  for (const r of rows) byKey.set(r.translationKey, [...(byKey.get(r.translationKey) ?? []), r])
  return Array.from(byKey.entries()).map(([key, rs]) => {
    const es = rs.find((r) => r.locale === 'es')
    const main = es ?? rs[0]
    return {
      key, position: main.position, title: main.title, es: !!es, en: rs.some((r) => r.locale === 'en'),
      status: rs.every((r) => r.status === 'sent') ? 'sent' : rs.every((r) => r.status === 'skipped') ? 'skipped' : 'ready',
      isLegal: rs.some((r) => r.isLegal), words: main.content.trim().split(/\s+/).length,
      urls: rs.map((r) => r.url).filter((u): u is string => !!u), preview: main.content.slice(0, 700),
    }
  })
}

/** Manda al blog, como borrador, el siguiente artículo listo (o el de la clave indicada): español y luego inglés. */
export async function sendNextArticle(companyId: string, key?: string): Promise<{ ok: boolean; sent?: BlogPostCreated[]; title?: string; error?: string; empty?: boolean }> {
  const company = await prisma.cEOCompany.findUnique({ where: { id: companyId } })
  const profile = company ? await prisma.brandProfile.findFirst({ where: { companyId } }) : null
  if (!company) return { ok: false, error: 'Empresa no encontrada.' }
  const target = resolveBlogTarget(company, profile)
  if (!target) return { ok: false, error: `Falta conectar el blog de ${company.name}: guarda su dirección y agrega la variable ${blogEnvName(company.name)} en Railway con una clave de "solo borradores".` }
  const first = await prisma.blogArticle.findFirst({ where: { companyId, status: 'ready', ...(key ? { translationKey: key } : {}) }, orderBy: { position: 'asc' } })
  if (!first) return { ok: true, empty: true }
  const pair = await prisma.blogArticle.findMany({ where: { companyId, translationKey: first.translationKey, status: 'ready' }, orderBy: { locale: 'asc' } })
  const sent: BlogPostCreated[] = []
  try {
    for (const a of pair.sort((x, y) => (x.locale === 'es' ? -1 : 1) - (y.locale === 'es' ? -1 : 1))) {
      const created = await createBlogDraftRetry(target, {
        title: a.title, description: a.description, content: a.content, locale: a.locale as 'es' | 'en', slug: a.slug, tags: a.tags, translationKey: a.translationKey.slice(0, 80),
      })
      await prisma.blogArticle.update({ where: { id: a.id }, data: { status: 'sent', sentAt: new Date(), url: created.url, slug: created.slug } })
      sent.push(created)
    }
  } catch (err) {
    return { ok: false, title: first.title, sent, error: err instanceof BlogApiError ? err.message : 'No se pudo enviar al blog.' }
  }
  await logActivity('luis', 'blog', `Envió el borrador «${first.title.slice(0, 70)}» (${sent.map((s) => s.locale.toUpperCase()).join(' y ')}) al blog de ${company.name}`, { companyId })
  return { ok: true, sent, title: first.title }
}
