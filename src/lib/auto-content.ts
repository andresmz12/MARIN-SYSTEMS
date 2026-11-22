import { randomUUID } from 'crypto'
import { getISOWeek } from 'date-fns'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent, type GeneratedContent } from '@/lib/ai'
import { imagePlatformOf } from '@/lib/image-prompt'
import { factCheckPost } from '@/lib/agents-ai'
import { agentEnabled, logActivity, runAs } from '@/lib/agent-ledger'
import { knowledgeFor } from '@/lib/knowledge'
import { parseImageText } from '@/lib/image-prompt'

interface BrandReference { type: string; value: string; note?: string }

/** Referencias de la marca como líneas de texto listas para el prompt. */
export function referenceLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  // La IA no puede abrir links: un link solo aporta si trae una nota de qué gusta de él.
  return (raw as BrandReference[]).flatMap((r) => {
    if (!r || typeof r.value !== 'string') return []
    if (r.type === 'link') return r.note ? [`Post de referencia (${r.value}): ${r.note}`] : []
    return [r.note ? `${r.value} (${r.note})` : r.value]
  })
}

/** Lecciones activas del dueño (manuales) y últimas notas de rechazo: la generación aprende de ellas. */
export async function recentFeedback(companyId: string): Promise<string[]> {
  const [lessons, rows] = await Promise.all([
    prisma.agentLesson.findMany({ where: { companyId, active: true }, orderBy: { createdAt: 'desc' }, take: 12, select: { text: true } }),
    prisma.generatedPost.findMany({
      where: { companyId, status: 'rejected', reviewNote: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { reviewNote: true },
    }),
  ])
  return [...lessons.map((l) => l.text), ...rows.map((r) => r.reviewNote as string).filter(Boolean)]
}

/**
 * Un mismo contenido para varias redes: una fila por red, todas con el mismo groupId, copy
 * e imagen. La única diferencia la aplica `composePostText` al publicar (X recorta a 280).
 */
export function buildGroupDrafts(input: {
  userId: string
  companyId: string
  brandProfileId: string
  platforms: string[]
  generated: GeneratedContent
  scheduledDate: Date
  source: 'auto' | 'news' | 'recycled'
  sourceUrl?: string
  kind?: string
}): Prisma.GeneratedPostCreateManyInput[] {
  const groupId = randomUUID()
  const g = input.generated
  return input.platforms.map((platform) => ({
    userId: input.userId,
    companyId: input.companyId,
    brandProfileId: input.brandProfileId,
    groupId,
    platform,
    contentType: 'post',
    topic: g.topic,
    copy: g.copy,
    hashtags: g.hashtags,
    cta: g.cta,
    contentNotes: g.contentNotes,
    imagePrompt: g.imagePrompt,
    imageText: (g.imageText ?? undefined) as never,
    facts: g.facts,
    status: 'pending_review',
    source: input.source,
    sourceUrl: input.sourceUrl,
    kind: input.kind ?? null,
    scheduledDate: input.scheduledDate,
    weekNumber: getISOWeek(input.scheduledDate),
    dayOfWeek: Math.min(5, Math.max(1, input.scheduledDate.getUTCDay())),
  }))
}

/** Lo que mostraron las métricas la última semana, como líneas para la generación (cierra el ciclo). */
export async function latestInsights(companyId: string): Promise<string[]> {
  const r = await prisma.agentReport.findFirst({
    where: { companyId, kind: 'metrics' },
    orderBy: { createdAt: 'desc' },
    select: { content: true, createdAt: true },
  })
  if (!r || Date.now() - r.createdAt.getTime() > 21 * 24 * 60 * 60 * 1000) return []
  const c = r.content as { worked?: string[]; change?: string[] } | null
  return [
    ...(c?.worked ?? []).map((w) => `Funcionó: ${w}`),
    ...(c?.change ?? []).map((w) => `Cambiar: ${w}`),
  ].slice(0, 5)
}

/**
 * Verificador de datos sobre un grupo de posts ya creado: guarda el resultado en todas las filas
 * del grupo. Es de mejor esfuerzo: si falla, el post sigue su camino y el dueño lo ve sin verificar.
 */
export async function factCheckGroup(groupId: string, opts: { autoFix?: boolean } = {}): Promise<void> {
  const post = await prisma.generatedPost.findFirst({
    where: { groupId },
    include: { company: { select: { name: true } } },
  })
  if (!post) return
  if (!(await agentEnabled('felipe'))) return
  const library = await knowledgeFor(post.userId, post.companyId, `${post.topic} ${post.copy}`)
  const result = await runAs('felipe', () => factCheckPost({
    companyName: post.company.name,
    copy: post.copy,
    facts: post.facts,
    imageHeadline: parseImageText(post.imageText)?.headline,
    sourceUrl: post.sourceUrl,
    library,
  }))
  if (!result) {
    await logActivity('felipe', 'fact-check', `No pudo verificar «${post.topic.slice(0, 60)}» tras 2 intentos: el post quedó SIN verificar, revísalo con «Verificar datos»`)
    return
  }
  const bad = result.items.filter((i) => i.status === 'incorrecto').length
  const doubt = result.items.filter((i) => i.status === 'dudoso' || i.status === 'sin_fuente').length
  await logActivity('felipe', 'fact-check', `Verificó «${post.topic.slice(0, 60)}»: ${result.items.length} datos, ${bad} incorrectos, ${doubt} dudosos`, { companyId: post.companyId })
  await prisma.generatedPost.updateMany({
    where: { groupId },
    data: { factCheck: result as never, factCheckedAt: new Date() },
  })
  // Si hay datos incorrectos o dudosos, el post se corrige solo (una vez) y se vuelve a verificar.
  if (opts.autoFix && result.verdict !== 'ok' && post.status === 'pending_review') {
    const fixed = await autoFixGroup(groupId, result).catch((e) => { console.error('[auto-fix] falló:', e); return false })
    if (fixed) await factCheckGroup(groupId, { autoFix: false })
  }
}

type CheckResult = NonNullable<Awaited<ReturnType<typeof factCheckPost>>>

/** Reescribe el post corrigiendo lo que marcó el verificador. Guarda la versión anterior. Devuelve true si cambió algo. */
async function autoFixGroup(groupId: string, check: CheckResult): Promise<boolean> {
  const post = await prisma.generatedPost.findFirst({ where: { groupId }, include: { company: true, brandProfile: true } })
  if (!post) return false
  const bad = check.items.filter((it) => it.status !== 'confirmado')
  const note = [
    'Corrige el post según la verificación de datos. No cambies lo que está confirmado.',
    check.summary ? `Resumen del verificador: ${check.summary}` : '',
    ...bad.map((it) => `- ${it.claim}${it.note ? ` (${it.note})` : ''}`),
    'Usa solo datos de una misma temporada/año tributario, revisa que los ejemplos con cifras sean matemáticamente correctos, quita o suaviza lo que no tenga fuente oficial confirmada y no inventes cifras.',
  ].filter(Boolean).join('\n')
  const profile = post.brandProfile
  const references = referenceLines(profile.references)
  const feedback = await recentFeedback(post.companyId)
  const generated = await runAs('fernanda', () => generateMarketingContent({
    companyName: post.company.name,
    platform: imagePlatformOf(post),
    contentType: post.contentType,
    topic: `Reescribe este post: "${post.topic}". Ajuste pedido: ${note.slice(0, 1500)}.${post.sourceUrl ? ` Es una noticia oficial: ${post.sourceUrl}. No inventes datos.` : ''}`,
    research: true,
    tone: profile.tone,
    targetAudience: profile.targetAudience,
    contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
    references: references.length > 0 ? references : undefined,
    feedback: feedback.length > 0 ? feedback : undefined,
    voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
    forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
  }))
  if (generated.copy.includes('[Contenido de ')) return false // la IA falló: el post queda como estaba
  const previousVersion = { copy: post.copy, hashtags: post.hashtags, cta: post.cta, contentNotes: post.contentNotes, imagePrompt: post.imagePrompt, imageText: post.imageText ?? null, facts: post.facts, topic: post.topic, savedAt: new Date().toISOString() }
  await prisma.generatedPost.updateMany({
    where: { groupId, status: 'pending_review' },
    data: {
      previousVersion: previousVersion as never,
      copy: generated.copy, hashtags: generated.hashtags, cta: generated.cta, contentNotes: generated.contentNotes,
      imagePrompt: generated.imagePrompt, imageText: (generated.imageText ?? undefined) as never, facts: generated.facts,
    },
  })
  await logActivity('felipe', 'fact-check', `Corrigió solo «${post.topic.slice(0, 60)}» tras la verificación (${bad.length} observaciones)`, { companyId: post.companyId })
  return true
}
