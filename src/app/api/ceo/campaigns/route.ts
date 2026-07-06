import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { generateCampaignPlan } from '@/lib/ai'

export const maxDuration = 120

const CreateSchema = z.object({
  companyId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Mes debe ser YYYY-MM'),
  objective: z.string().min(1, 'Objetivo requerido').max(400),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const parsed = CreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { companyId, month, objective } = parsed.data

    const [company, profile] = await Promise.all([
      prisma.cEOCompany.findFirst({ where: { id: companyId, userId } }),
      prisma.brandProfile.findUnique({ where: { companyId } }),
    ])
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const plan = await generateCampaignPlan({
      companyName: company.name,
      objective,
      month,
      targetAudience: profile?.targetAudience ?? 'clientes latinos en USA y Colombia',
      tone: profile?.tone ?? 'cercano y profesional',
      contentPillars: profile && Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
      competitors: profile && Array.isArray(profile.competitors) ? (profile.competitors as string[]) : [],
    })

    const pillars = plan.pillars as unknown as Prisma.InputJsonValue
    const weeks = plan.weeks as unknown as Prisma.InputJsonValue
    const kpis = plan.kpis as unknown as Prisma.InputJsonValue

    const campaign = await prisma.marketingCampaign.upsert({
      where: { companyId_month: { companyId, month } },
      update: {
        objective,
        bigIdea: plan.bigIdea,
        pillars,
        weeks,
        kpis,
        status: 'active',
      },
      create: {
        userId,
        companyId,
        month,
        objective,
        bigIdea: plan.bigIdea,
        pillars,
        weeks,
        kpis,
      },
    })

    return NextResponse.json(campaign, { status: 201 })
  } catch (err) {
    console.error('[ceo/campaigns POST]', err)
    return NextResponse.json({ error: 'Error al generar el plan de campaña' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const month = searchParams.get('month')
    if (!companyId || !month) {
      return NextResponse.json({ error: 'companyId y month requeridos' }, { status: 400 })
    }

    const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { companyId_month: { companyId, month } },
    })

    return NextResponse.json(campaign)
  } catch (err) {
    console.error('[ceo/campaigns GET]', err)
    return NextResponse.json({ error: 'Error al obtener el plan' }, { status: 500 })
  }
}
