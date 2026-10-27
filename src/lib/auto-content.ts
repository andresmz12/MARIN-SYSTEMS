import { prisma } from '@/lib/prisma'

interface BrandReference { type: string; value: string; note?: string }

/** Referencias de la marca como líneas de texto listas para el prompt. */
export function referenceLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return (raw as BrandReference[])
    .filter((r) => r && typeof r.value === 'string')
    .map((r) => (r.note ? `${r.value} (${r.note})` : r.value))
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
