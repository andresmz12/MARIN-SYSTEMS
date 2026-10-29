import { NextResponse } from 'next/server'
import { backgroundCron } from '@/lib/cron-run'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'
import { buildGroupDrafts, factCheckGroup, latestInsights, recentFeedback, referenceLines } from '@/lib/auto-content'
import { knowledgeFor } from '@/lib/knowledge'
import { discoverNews, vetNews } from '@/lib/agents-ai'
import { avoidList, isRepeat, topicHistory } from '@/lib/topic-memory'
import { GROUP_IMAGE_PLATFORM } from '@/lib/image-prompt'
import { fetchFeed, newsFeedUrls, verifyArticle, type NewsItem } from '@/lib/news'
import { AUTO_PLATFORMS, isAutoPlatform } from '@/lib/platforms'
import { sendContentReadyEmail } from '@/lib/sendgrid-client'

export const maxDuration = 300

// Solo noticias recientes: una noticia vieja ya no es "noticia".
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
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

  try {
    // Un feed caído no debe frenar a los demás, pero si TODOS fallan sí es un error que debe verse.
    const items: NewsItem[] = []
    const feedErrors: string[] = []
    for (const url of feeds) {
      try { items.push(...(await fetchFeed(url))) } catch (e) { feedErrors.push(e instanceof Error ? e.message : String(e)) }
    }
    const allFeedsFailed = feeds.length > 0 && feedErrors.length === feeds.length

    const cutoff = Date.now() - MAX_AGE_MS
    // Solo cuenta lo que trae SU PROPIA fecha y es reciente. Sin fecha (menús, páginas fijas como un resumen
    // de una ley) NO es noticia: antes se trataban como nuevas y salían notas viejas.
    const now = Date.now()
    const fresh = items
      .filter((i): i is NewsItem & { publishedAt: Date } => !!i.publishedAt && i.publishedAt.getTime() >= cutoff && i.publishedAt.getTime() <= now + 24 * 60 * 60 * 1000)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())

    // Desde la pantalla se puede pedir una sola empresa.
    const only = ((await req.clone().json().catch(() => ({}))) as { companyId?: string }).companyId
    const profiles = await prisma.brandProfile.findMany({
      where: { newsEnabled: true, ...(only ? { companyId: only } : {}) },
      include: { company: { select: { id: true, name: true } } },
    })

    const summary: { company: string; created: number; skipped?: string; error?: string; rejected?: string[]; news?: number; web?: number }[] = []

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
        const pillars = Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : []
        const history = await topicHistory(profile.companyId)
        type Candidate = NewsItem & { publishedAt: Date; web?: boolean; sourceName?: string }
        const todo: Candidate[] = fresh.filter((i) => !known.has(i.link))

        // Además de las fuentes fijas, el investigador busca en la web noticias recientes de contabilidad e impuestos.
        // Nada de lo que traiga se confía tal cual: cada una se abre y se verifica abajo (con la fecha de la propia página).
        const web = await discoverNews({ companyName: name, targetAudience: profile.targetAudience, contentPillars: pillars, pastTopics: history.topics })
        for (const w of web) {
          if (w.publishedAt.getTime() < cutoff || w.publishedAt.getTime() > now + 24 * 60 * 60 * 1000) continue
          if (todo.some((t) => t.link === w.link) || history.urls.has(w.link)) continue
          todo.push({ title: w.title, link: w.link, summary: '', publishedAt: w.publishedAt, web: true, sourceName: w.source })
        }
        if (todo.length === 0) {
          summary.push({ company: name, created: 0, skipped: 'sin noticias nuevas', web: web.length })
          continue
        }

        const selected = profile.autoPlatforms.filter(isAutoPlatform)
        const platforms: string[] = selected.length > 0 ? selected : [...AUTO_PLATFORMS]
        const references = referenceLines(profile.references)
        const feedback = [...(await recentFeedback(profile.companyId)), ...(await latestInsights(profile.companyId))]
        let created = 0
        let made = 0
        const rejected: string[] = []

        for (const item of todo) {
          if (made >= MAX_PER_RUN) break
          // Memoria: la misma noticia (enlace) o el mismo tema con otras palabras no se repite.
          const dup = history.urls.has(item.link) ? 'ese enlace' : isRepeat(item.title, history.topics)
          if (dup) {
            rejected.push(`"${item.title.slice(0, 60)}": ya usamos ese tema (${dup === 'ese enlace' ? dup : `"${dup.slice(0, 50)}"`})`)
            continue
          }
          // Antes de escribir: el enlace abre, es ESA noticia y su fecha coincide. Si no, se descarta.
          const check = await verifyArticle(item, { requirePageDate: item.web })
          if (!check.ok) {
            rejected.push(`"${item.title.slice(0, 60)}": ${check.reason}`)
            continue
          }
          const vet = await vetNews({ companyName: name, targetAudience: profile.targetAudience, title: item.title, date: check.date!.toISOString().slice(0, 10), text: check.text, pastTopics: history.topics })
          if (vet && !vet.accept) {
            rejected.push(`"${item.title.slice(0, 60)}": el revisor la descartó (${vet.reason})`)
            continue
          }
          made++
          item.summary = check.text
          const published = check.date!.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
          const sourceLine = `${item.web ? `Fuente verificada en la web${item.sourceName ? ` (${item.sourceName})` : ''}` : 'Fuente oficial verificada'}: "${item.title}" (${check.releaseId ? `${check.releaseId}, ` : ''}publicada el ${published}) ${item.link}`
          const generated = await generateMarketingContent({
            companyName: name,
            platform: GROUP_IMAGE_PLATFORM,
            contentType: 'post',
            topic: [
              `${item.web ? 'NOTICIA' : 'NOTICIA OFICIAL'} para explicar a nuestra audiencia: "${item.title}", publicada el ${published}.`,
              item.summary ? `Resumen de la fuente: ${item.summary}` : '',
              `Fuente: ${item.link}.`,
              history.topics.length ? `Temas que YA publicamos (no repetir ni parafrasear): ${avoidList(history.topics)}.` : '',
              'Usa los datos de este texto y completa los detalles con la fuente oficial (irs.gov): quién califica, montos, fechas y un ejemplo con números. No inventes nada: si un dato importante no aparece en una fuente oficial, no lo afirmes. Pon en "facts" cada dato concreto (montos, fechas, formularios) con su fuente, para que el dueño lo verifique.',
            ].filter(Boolean).join(' '),
            research: true,
            knowledge: await knowledgeFor(profile.userId, profile.companyId, `${item.title} ${item.summary}`),
            tone: profile.tone,
            targetAudience: profile.targetAudience,
            contentPillars: pillars,
            references: references.length > 0 ? references : undefined,
            feedback: feedback.length > 0 ? feedback : undefined,
            voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
            forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
          })
          if (generated.copy.includes('[Contenido de ')) {
            made--
            rejected.push(`"${item.title.slice(0, 60)}": la IA no devolvió contenido válido, se intentará en la próxima corrida`)
            continue
          }
          const again = isRepeat(generated.topic, history.topics)
          if (again) {
            made--
            rejected.push(`"${item.title.slice(0, 60)}": el post salió igual a uno anterior ("${again.slice(0, 50)}")`)
            continue
          }
          generated.facts = [sourceLine, ...generated.facts].slice(0, 7)
          history.topics.unshift(generated.topic)
          history.urls.add(item.link)

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
        summary.push({ company: name, created, news: made, web: web.length, ...(rejected.length ? { rejected } : {}) })
      } catch (err) {
        console.error(`[cron/news-watch] ${name}`, err)
        summary.push({ company: name, created: 0, error: String(err) })
      }
    }

    console.log('[cron/news-watch]', JSON.stringify({ summary, feedErrors }))
    // Si TODAS las fuentes fijas fallaron y la búsqueda en la web tampoco aportó nada, es un error que debe verse.
    if (allFeedsFailed && summary.every((r) => r.created === 0 && !r.web)) throw new Error(`No se pudo leer ninguna fuente: ${feedErrors.join(' | ')}`)
    return NextResponse.json({
      processed: profiles.length,
      found: items.length,
      fresh: fresh.length,
      feedErrors,
      // Lo que vio la lectura (para entender por qué hay o no noticias): título y fecha detectada.
      latest: items.reduce<string | null>((m, i) => { const d = i.publishedAt?.toISOString().slice(0, 10) ?? null; return d && (!m || d > m) ? d : m }, null),
      undated: items.filter((i) => !i.publishedAt).length,
      // Solo las que traen fecha (las demás son menús y páginas fijas), de la más reciente a la más antigua.
      sample: items
        .filter((i): i is NewsItem & { publishedAt: Date } => !!i.publishedAt)
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .slice(0, 8)
        .map((i) => ({ title: i.title.slice(0, 90), date: i.publishedAt.toISOString().slice(0, 10) })),
      summary,
    })
  } catch (err) {
    console.error('[cron/news-watch]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error leyendo noticias' }, { status: 500 })
  }
}

export const POST = backgroundCron('news-watch', handler)
