import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CEOCompanyCreateSchema, FOREX_COMPANY_NAME } from '@/lib/ceo'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const companies = await prisma.cEOCompany.findMany({
      where: { userId: session.user.id, name: { not: FOREX_COMPANY_NAME } },
      orderBy: { createdAt: 'asc' },
      include: {
        marketingIdeas: {
          where: { status: { in: ['idea', 'in_progress'] } },
          select: { id: true },
        },
        workBlocks: {
          where: { status: 'pending' },
          select: { id: true },
        },
        company: { select: { id: true, name: true } },
      },
    })

    const result = companies.map(({ marketingIdeas, workBlocks, ...c }) => ({
      ...c,
      pendingIdeas: marketingIdeas.length,
      pendingBlocks: workBlocks.length,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener empresas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = CEOCompanyCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { name, color, emoji, country, strategicWeight, isActive, companyId } = parsed.data

    if (companyId) {
      const owned = await prisma.company.findFirst({ where: { id: companyId, userId: session.user.id } })
      if (!owned) return NextResponse.json({ error: 'Empresa a vincular no encontrada' }, { status: 404 })
    }

    const company = await prisma.cEOCompany.create({
      data: {
        userId: session.user.id,
        name,
        color: color ?? '#6366f1',
        emoji: emoji ?? '🏢',
        country: country ?? [],
        strategicWeight: strategicWeight ?? 3,
        isActive: isActive ?? true,
        companyId: companyId ?? null,
      },
    })

    return NextResponse.json({ ...company, pendingIdeas: 0, pendingBlocks: 0 }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear empresa' }, { status: 500 })
  }
}
