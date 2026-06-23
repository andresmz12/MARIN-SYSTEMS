import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateMarketingContent } from '@/lib/ai'

const Schema = z.object({
  companyId: z.string().min(1),
  workBlockId: z.string().optional(),
  platform: z.enum(['instagram', 'tiktok', 'email', 'whatsapp']),
  contentType: z.enum(['reel', 'post', 'story', 'caption', 'email']),
  topic: z.string().max(200).optional().default(''),
  weekNumber: z.number().int().min(1).max(53),
  dayOfWeek: z.number().int().min(1).max(5).default(1),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { companyId, workBlockId, platform, contentType, topic, weekNumber, dayOfWeek } = parsed.data

    const [company, profile] = await Promise.all([
      prisma.cEOCompany.findFirst({ where: { id: companyId, userId } }),
      prisma.brandProfile.findUnique({ where: { companyId } }),
    ])
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    if (!profile) return NextResponse.json({ error: 'Configura primero el perfil de marca de esta empresa' }, { status: 400 })

    // Last 5 marketing ideas for context
    const ideas = await prisma.marketingIdea.findMany({
      where: { userId, companyId, status: { in: ['idea', 'in_progress'] } },
      orderBy: { priority: 'desc' },
      take: 5,
    })
    const contentPillars = Array.isArray(profile.contentPillars)
      ? (profile.contentPillars as string[])
      : []

    // Merge pillars from profile with idea titles for richer context
    const enrichedTopic = topic || ideas.map((i) => i.title).slice(0, 2).join(' / ') || ''

    const generated = await generateMarketingContent({
      companyName: company.name,
      platform,
      contentType,
      topic: enrichedTopic,
      tone: profile.tone,
      targetAudience: profile.targetAudience,
      contentPillars,
      voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
      forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
    })

    const post = await prisma.generatedPost.create({
      data: {
        userId,
        companyId,
        brandProfileId: profile.id,
        workBlockId: workBlockId ?? null,
        platform,
        contentType,
        topic: generated.topic,
        copy: generated.copy,
        hashtags: generated.hashtags,
        cta: generated.cta,
        contentNotes: generated.contentNotes,
        status: 'draft',
        weekNumber,
        dayOfWeek,
      },
      include: { company: true },
    })

    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al generar contenido' }, { status: 500 })
  }
}
