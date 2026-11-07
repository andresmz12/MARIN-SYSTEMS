import { BlogApiError, blogEnvName, createBlogDraft, resolveBlogTarget, type BlogPostCreated } from '@/lib/blog-api'
import { logActivity } from '@/lib/agent-ledger'
import { prisma } from '@/lib/prisma'

// Manda al blog de otra empresa, como BORRADOR, el mismo contenido que ya se publicó en redes (sin crear nada nuevo ni gastar IA).

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)

/** Convierte el texto del post de redes en Markdown de blog: viñetas, párrafos y sin HTML ni títulos "#". */
export function copyToMarkdown(copy: string): string {
  return copy
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .split('\n')
    .map((l) => {
      const t = l.replace(/^\s+/, '')
      const bullet = ['✅', '✔', '❌', '✖', '•', '·', '▪', '* ']
      const hit = bullet.find((b) => t.startsWith(b))
      return (hit ? `- ${t.slice(hit.length).trim()}` : l).replace(/^#+\s+/, '')
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function descriptionOf(copy: string): string {
  const plain = copy.replace(/\s+/g, ' ').replace(/[#*_>`-]/g, '').trim()
  if (plain.length <= 160) return plain.length >= 30 ? plain : `${plain} — guía práctica para tu negocio`.slice(0, 160)
  const cut = plain.slice(0, 157)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

export interface MirrorResult { ok: boolean; created?: BlogPostCreated; error?: string; skipped?: string }

/** Envía un post (y sus hermanos de otras redes cuentan como uno) al blog de la empresa de destino. */
export async function mirrorPostToBlog(postId: string, targetCompanyId: string): Promise<MirrorResult> {
  const post = await prisma.generatedPost.findUnique({ where: { id: postId } })
  const company = await prisma.cEOCompany.findUnique({ where: { id: targetCompanyId } })
  const profile = company ? await prisma.brandProfile.findFirst({ where: { companyId: targetCompanyId } }) : null
  if (!post || !company) return { ok: false, error: 'No encontré el post o la empresa de destino.' }
  const target = resolveBlogTarget(company, profile)
  if (!target) return { ok: false, error: `El blog de ${company.name} no está conectado: guarda su dirección y agrega la variable ${blogEnvName(company.name)} en Railway.` }

  const groupKey = post.groupId ?? post.id
  if (await prisma.blogMirror.findUnique({ where: { groupKey_targetCompanyId: { groupKey, targetCompanyId } } })) return { ok: true, skipped: 'Ese post ya se envió a ese blog.' }

  const content = copyToMarkdown(post.copy) + (profile?.blogCta ? `\n\n---\n\n${profile.blogCta}` : '')
  if (content.length < 200) return { ok: false, error: 'El texto del post es muy corto para un artículo (el blog pide al menos 200 caracteres).' }
  const tags = post.hashtags.map((h) => h.replace(/^#/, '').slice(0, 40)).filter(Boolean).slice(0, 10)
  const coverImageUrl = post.imageUrl && /^https:\/\//.test(post.imageUrl) ? post.imageUrl : undefined
  const base = slugify(post.topic) || `post-${post.id.slice(-6)}`
  try {
    let created: BlogPostCreated | null = null
    for (let n = 1; n <= 3 && !created; n++) {
      try {
        created = await createBlogDraft(target, {
          title: post.topic.slice(0, 140).padEnd(5, '.'), description: descriptionOf(post.copy), content, locale: 'es', tags,
          slug: n === 1 ? base : `${base}-${n}`, ...(coverImageUrl ? { coverImageUrl, coverImageAlt: post.topic.slice(0, 200) } : {}),
        })
      } catch (e) { if (!(e instanceof BlogApiError && e.status === 409) || n === 3) throw e }
    }
    await prisma.blogMirror.create({ data: { groupKey, targetCompanyId, sourcePostId: post.id, slug: created!.slug, url: created!.url } })
    await logActivity('luis', 'mirror', `Envió «${post.topic.slice(0, 70)}» como borrador al blog de ${company.name}`, { companyId: targetCompanyId })
    return { ok: true, created: created! }
  } catch (err) {
    return { ok: false, error: err instanceof BlogApiError ? err.message : 'No se pudo enviar al blog.' }
  }
}

/** Revisa los blogs con "espejo" activo y manda los posts publicados desde que se activó (máximo 3 por pasada). */
export async function runMirrors(): Promise<{ sent: number; errors: string[] }> {
  const profiles = await prisma.brandProfile.findMany({ where: { blogMirrorFrom: { not: null }, blogMirrorSince: { not: null } } })
  let sent = 0
  const errors: string[] = []
  for (const p of profiles) {
    const posts = await prisma.generatedPost.findMany({
      where: { companyId: p.blogMirrorFrom!, status: 'published', publishedAt: { gte: p.blogMirrorSince! } },
      orderBy: { publishedAt: 'asc' }, take: 60,
    })
    const done = new Set((await prisma.blogMirror.findMany({ where: { targetCompanyId: p.companyId }, select: { groupKey: true } })).map((m) => m.groupKey))
    const seen = new Set<string>()
    for (const post of posts) {
      const key = post.groupId ?? post.id
      if (done.has(key) || seen.has(key)) continue
      seen.add(key)
      if (sent >= 3) break
      const r = await mirrorPostToBlog(post.id, p.companyId)
      if (r.ok && !r.skipped) sent++
      else if (!r.ok) errors.push(r.error ?? 'error')
    }
  }
  return { sent, errors }
}
