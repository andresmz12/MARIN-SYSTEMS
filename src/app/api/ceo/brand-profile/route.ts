import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { analyzeBrand } from '@/lib/ai'

const Schema = z.object({
  companyId: z.string().min(1),
  tone: z.string().min(1).max(50),
  targetAudience: z.string().min(1).max(500),
  contentPillars: z.array(z.string().max(80)).min(1).max(5),
  competitors: z.array(z.string().max(100)).max(5).default([]),
  voiceSamples: z.array(z.string().max(1000)).max(3).default([]),
  forbiddenWords: z.array(z.string().max(100)).max(50).default([]),
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
    const { companyId, tone, targetAudience, contentPillars, competitors, voiceSamples, forbiddenWords } = parsed.data

    const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    // AI market analysis (graceful fallback built-in)
    const analysis = await analyzeBrand({
      companyName: company.name,
      targetAudience,
      tone,
      competitors,
      contentPillars,
    })

    const profile = await prisma.brandProfile.upsert({
      where: { companyId },
      update: {
        tone,
        targetAudience,
        contentPillars,
        competitors,
        bestDays: analysis.bestDays,
        bestHours: analysis.bestHours,
        voiceSamples: voiceSamples.length > 0 ? voiceSamples : undefined,
        forbiddenWords: forbiddenWords.length > 0 ? forbiddenWords : undefined,
      },
      create: {
        userId,
        companyId,
        tone,
        targetAudience,
        contentPillars,
        competitors,
        bestDays: analysis.bestDays,
        bestHours: analysis.bestHours,
        voiceSamples: voiceSamples.length > 0 ? voiceSamples : undefined,
        forbiddenWords: forbiddenWords.length > 0 ? forbiddenWords : undefined,
      },
    })

    return NextResponse.json({
      ...profile,
      competitorInsights: analysis.competitorInsights,
      recommendedFrequency: analysis.recommendedFrequency,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al guardar el perfil de marca' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

    // Ownership check: only return the profile if the company belongs to the caller.
    const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const profile = await prisma.brandProfile.findUnique({ where: { companyId } })
    return NextResponse.json(profile)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener el perfil de marca' }, { status: 500 })
  }
}
