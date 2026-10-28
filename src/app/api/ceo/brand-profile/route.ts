import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { analyzeBrand } from '@/lib/ai'
import { AUTO_PLATFORMS } from '@/lib/platforms'

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

const AutoSchema = z.object({
  companyId: z.string().min(1),
  autoEnabled: z.boolean().optional(),
  newsEnabled: z.boolean().optional(),
  autoPlatforms: z.array(z.enum(AUTO_PLATFORMS)).min(1).optional(),
  visualStyle: z.object({
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(5).optional(),
    style: z.string().trim().max(300).optional(),
    handle: z.string().trim().max(120).optional(),
    avoid: z.string().trim().max(200).optional(),
  }).optional(),
  references: z.array(z.object({
    type: z.enum(['link', 'text']),
    value: z.string().min(1).max(1500),
    note: z.string().max(300).optional(),
  })).max(15).optional(),
})

// Activa/desactiva el piloto automático de una marca sin tocar el resto del perfil.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const parsed = AutoSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { companyId, autoEnabled, newsEnabled, autoPlatforms, references, visualStyle } = parsed.data

    const profile = await prisma.brandProfile.findFirst({ where: { companyId, userId: session.user.id } })
    if (!profile) return NextResponse.json({ error: 'Configura primero el perfil de marca de esta empresa' }, { status: 400 })

    const updated = await prisma.brandProfile.update({
      where: { id: profile.id },
      data: {
        ...(autoEnabled !== undefined ? { autoEnabled } : {}),
        ...(newsEnabled !== undefined ? { newsEnabled } : {}),
        ...(autoPlatforms !== undefined ? { autoPlatforms } : {}),
        ...(references !== undefined ? { references } : {}),
        ...(visualStyle !== undefined ? { visualStyle } : {}),
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al actualizar el piloto automático' }, { status: 500 })
  }
}
