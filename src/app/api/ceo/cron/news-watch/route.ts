import { NextResponse } from 'next/server'
import { backgroundCron } from '@/lib/cron-run'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'
import { buildGroupDrafts, factCheckGroup, latestInsights, recentFeedback, referenceLines } from '@/lib/auto-content'
import { knowledgeFor } from '@/lib/knowledge'
import { GROUP_IMAGE_PLATFORM } from '@/lib/image-prompt'
import { fetchArticleText, fetchFeed, newsFeedUrls, type NewsItem } from '@/lib/news'
import { AUTO_PLATFORMS, isAutoPlatform } from '@/lib/platforms'
import { sendContentReadyEmail } from '@/lib/sendgrid-client'

export const maxDuration = 300

// Solo noticias recientes: una noticia vieja ya no es "noticia".
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
// Tope por empresa y por corrida, para no inundar la bandeja de aprobación.
const MAX_PER_RUN = 2
const MAX_PENDING_NEWS = 6
// Sale a la 1 PM Colombia (18:00 UTC) del próximo día en que esa hora aún no haya pasado.
const POST_HOUR_UTC = 18

function nextPublishSlot(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), POST_HOUR_UTC))
  if (d.getTime() <= now.getTime() + 60 * 60 * 1000) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })
  }
  const feeds = newsFeedUrls()
  if (feeds.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 'NEWS_FEED_URLS no configurado' })
  }

  try {
    // Un feed caído no debe frenar a los demás, pero si TODOS fallan sí es un error que debe verse.
    const items: NewsItem[] = []
    const feedErrors: string[] = []
    for (const url of feeds) {
      try { items.push(...(await fetchFeed(url))) } catch (e) { feedErrors.push(e instanceof Error ? e.message : String(e)) }
    }
    if (feedErrors.length === feeds.length) throw new Error(`No se pudo leer ninguna fuente: ${feedErrors.join(' | ')}`)

    const cutoff = Date.now() - MAX_AGE_MS
    // Una página de listado sin fecha en cada noticia ("comunicados del mes"): se toman como nuevas
    // y la deduplicación por enlace evita repetirlas.
    const fresh = items
      .map((i) => ({ ...i, publishedAt: i.publishedAt ?? new Date() }))
      .filter((i) => i.publishedAt.getTime() >= cutoff)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))

    const profiles = await prisma.brandProfile.findMany({
      where: { newsEnabled: true },
      include: { company: { select: { id: true, name: true } } },
    })

    const summary: { company: string; created: number; skipped?: string; error?: string }[] = []

    for (const profile of profiles) {
      const name = profile.company.name
      try {
        // Se cuentan noticias (grupos), no filas: cada noticia ocupa una fila por red.
        const pendingNews = (await prisma.generatedPost.findMany({
          where: { companyId: profile.companyId, source: 'news', status: 'pending_review' },
          distinct: ['groupId'],
          select: { id: true },
        })).length
        if (pendingNews >= MAX_PENDING_NEWS) {
          summary.push({ company: name, created: 0, skipped: `${pendingNews} noticias sin revisar` })
          continue
        }

        // Ya usadas (aunque se hayan rechazado): no volver a proponer la misma noticia.
        const known = new Set(
          (await prisma.generatedPost.findMany({
            where: { companyId: profile.companyId, sourceUrl: { in: fresh.map((i) => i.link) } },
            select: { sourceUrl: true },
          })).map((r) => r.sourceUrl),
        )
        const todo = fresh.filter((i) => !known.has(i.link)).slice(0, MAX_PER_RUN)
        if (todo.length === 0) {
          summary.push({ company: name, created: 0, skipped: 'sin noticias nuevas' })
          continue
        }

        const selected = profile.autoPlatforms.filter(isAutoPlatform)
        const platforms: string[] = selected.length > 0 ? selected : [...AUTO_PLATFORMS]
        const pillars = Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : []
        const references = referenceLines(profile.references)
        const feedback = [...(await recentFeedback(profile.companyId)), ...(await latestInsights(profile.companyId))]
        let created = 0

        for (const item of todo) {
          if (!item.summary) item.summary = await fetchArticleText(item.link)
          const generated = await generateMarketingContent({
            companyName: name,
            platform: GROUP_IMAGE_PLATFORM,
            contentType: 'post',
            topic: [
              `NOTICIA OFICIAL para explicar a nuestra audiencia: "${item.title}".`,
              item.summary ? `Resumen de la fuente: ${item.summary}` : '',
              `Fuente: ${item.link}.`,
              'Usa SOLO los datos que aparecen en este texto; no inventes montos, fechas ni requisitos. Explícalo simple y di qué debe hacer la persona. Si algo importante no está en el texto, no lo afirmes. Pon en "facts" cada dato concreto (montos, fechas, formularios) para que el dueño lo verifique contra la fuente.',
            ].filter(Boolean).join(' '),
            knowledge: await knowledgeFor(profile.userId, profile.companyId, `${item.title} ${item.summary}`),
            tone: profile.tone,
            targetAudience: profile.targetAudience,
            contentPillars: pillars,
            references: references.length > 0 ? references : undefined,
            feedback: feedback.length > 0 ? feedback : undefined,
            voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
            forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
          })
          if (generated.copy.includes('[Contenido de ')) throw new Error('La IA no devolvió contenido válido')

          const drafts = buildGroupDrafts({
              userId: profile.userId,
              companyId: profile.companyId,
              brandProfileId: profile.id,
              platforms,
              generated,
              scheduledDate: nextPublishSlot(new Date()),
              source: 'news',
              sourceUrl: item.link,
            })
          await prisma.generatedPost.createMany({ data: drafts })
          const gid = drafts[0]?.groupId
          if (gid) await factCheckGroup(gid).catch((e) => console.error('[cron/news-watch] verificación falló:', e))
          created += platforms.length
          const pending = await prisma.generatedPost.count({ where: { companyId: profile.companyId, status: 'pending_review' } })
          const notify = await sendContentReadyEmail({ companyName: name, count: 1, pendingTotal: pending, newsTitle: item.title })
          if (!notify.success) console.error('[cron/news-watch] aviso por correo falló:', notify.error)
        }
        summary.push({ company: name, created })
      } catch (err) {
        console.error(`[cron/news-watch] ${name}`, err)
        summary.push({ company: name, created: 0, error: String(err) })
      }
    }

    console.log('[cron/news-watch]', JSON.stringify({ summary, feedErrors }))
    return NextResponse.json({ processed: profiles.length, fresh: fresh.length, feedErrors, summary })
  } catch (err) {
    console.error('[cron/news-watch]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error leyendo noticias' }, { status: 500 })
  }
}

export const POST = backgroundCron('news-watch', handler)
