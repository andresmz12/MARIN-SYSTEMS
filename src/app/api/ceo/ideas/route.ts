import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MarketingIdeaCreateSchema } from '@/lib/ceo'
import type { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const status = searchParams.get('status')

    const where: Prisma.MarketingIdeaWhereInput = { userId: session.user.id }
    if (companyId) where.companyId = companyId
    if (status) where.status = status

    const ideas = await prisma.marketingIdea.findMany({
      where,
      include: { company: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json(ideas)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener ideas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = MarketingIdeaCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { companyId, title, description, type, status, priority } = parsed.data

    // Ensure the company belongs to the user.
    const company = await prisma.cEOCompany.findFirst({
      where: { id: companyId, userId: session.user.id },
    })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const idea = await prisma.marketingIdea.create({
      data: {
        userId: session.user.id,
        companyId,
        title,
        description: description ?? null,
        type,
        status: status ?? 'idea',
        priority: priority ?? 3,
      },
      include: { company: true },
    })

    return NextResponse.json(idea, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear idea' }, { status: 500 })
  }
}
