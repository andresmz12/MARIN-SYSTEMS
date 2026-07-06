import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { planWeek } from '@/lib/ceo'
import { generateMarketingContent } from '@/lib/ai'

const Schema = z.object({
  companyId: z.string().min(1),
  weekNumber: z.number().int().min(1).max(53),
})

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const parsed = Schema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { companyId, weekNumber } = parsed.data

    const [company, profile] = await Promise.all([
      prisma.cEOCompany.findFirst({ where: { id: companyId, userId } }),
      prisma.brandProfile.findUnique({ where: { companyId } }),
    ])
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    if (!profile) return NextResponse.json({ error: 'Configura primero el perfil de marca de esta empresa' }, { status: 400 })

    const contentPillars = Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : []
    const angleRows = await prisma.contentAngle.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    const angles = angleRows.map((a) => ({ angle: a.angle, hook: a.hook }))

    // Only fill cells that don't already have a post this week, so we never clobber edits.
    const existing = await prisma.generatedPost.findMany({
      where: { userId, companyId, weekNumber },
      select: { dayOfWeek: true, platform: true },
    })
    const taken = new Set(existing.map((p) => `${p.dayOfWeek}:${p.platform}`))

    const plan = planWeek(contentPillars, angles).filter(
      (cell) => !taken.has(`${cell.dayOfWeek}:${cell.platform}`),
    )

    const usedTopics: string[] = []
    const created = []

    for (const cell of plan) {
      // Rotate the angle list so this cell prefers its assigned angle first.
      const rotated = cell.angle
        ? [{ angle: cell.angle, hook: cell.hook ?? '' }, ...angles.filter((a) => a.angle !== cell.angle)]
        : angles

      const generated = await generateMarketingContent({
        companyName: company.name,
        platform: cell.platform,
        contentType: cell.contentType,
        topic: usedTopics.length
          ? `Enfoque: ${cell.pillar}. NO repitas estos temas ya usados esta semana: ${usedTopics.join('; ')}.`
          : '',
        tone: profile.tone,
        targetAudience: profile.targetAudience,
        contentPillars,
        pillar: cell.pillar,
        angles: rotated.length > 0 ? rotated : undefined,
        voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
        forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
      })
      usedTopics.push(generated.topic)

      const post = await prisma.generatedPost.create({
        data: {
          userId,
          companyId,
          brandProfileId: profile.id,
          platform: cell.platform,
          contentType: cell.contentType,
          topic: generated.topic,
          copy: generated.copy,
          hashtags: generated.hashtags,
          cta: generated.cta,
          contentNotes: generated.contentNotes,
          status: 'draft',
          weekNumber,
          dayOfWeek: cell.dayOfWeek,
        },
        include: { company: true },
      })
      created.push(post)
    }

    return NextResponse.json({ created, skipped: taken.size }, { status: 201 })
  } catch (err) {
    console.error('[ceo/generate-week]', err)
    return NextResponse.json({ error: 'Error al generar la semana' }, { status: 500 })
  }
}
