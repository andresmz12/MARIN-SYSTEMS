import { randomUUID } from 'crypto'
import { getISOWeek } from 'date-fns'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { GeneratedContent } from '@/lib/ai'

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

/** Últimas notas de rechazo de la marca, para que la generación aprenda de ellas. */
export async function recentFeedback(companyId: string): Promise<string[]> {
  const rows = await prisma.generatedPost.findMany({
    where: { companyId, status: 'rejected', reviewNote: { not: null } },
    orderBy: { updatedAt: 'desc' },
    take: 6,
    select: { reviewNote: true },
  })
  return rows.map((r) => r.reviewNote as string).filter(Boolean)
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
  source: 'auto' | 'news'
  sourceUrl?: string
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
    scheduledDate: input.scheduledDate,
    weekNumber: getISOWeek(input.scheduledDate),
    dayOfWeek: Math.min(5, Math.max(1, input.scheduledDate.getUTCDay())),
  }))
}
