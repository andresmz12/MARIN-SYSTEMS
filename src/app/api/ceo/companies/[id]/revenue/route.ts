import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpsertSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Formato debe ser YYYY-MM'),
  target: z.number().min(0).optional().default(0),
  actual: z.number().min(0).optional().default(0),
  currency: z.string().min(1).max(5).optional().default('USD'),
  notes: z.string().max(500).nullable().optional(),
})

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear())

  try {
    const company = await prisma.cEOCompany.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const revenues = await prisma.companyRevenue.findMany({
      where: { companyId: params.id, userId: session.user.id, month: { startsWith: year } },
      orderBy: { month: 'asc' },
    })
    return NextResponse.json(revenues)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al cargar ingresos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const body = await req.json()
    const parsed = UpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const company = await prisma.cEOCompany.findFirst({
      where: { id: params.id, userId },
    })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const { month, target, actual, currency, notes } = parsed.data
    const revenue = await prisma.companyRevenue.upsert({
      where: { companyId_month: { companyId: params.id, month } },
      create: { userId, companyId: params.id, month, target, actual, currency, notes: notes ?? null },
      update: { target, actual, currency, notes: notes ?? undefined },
    })
    return NextResponse.json(revenue)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al guardar ingresos' }, { status: 500 })
  }
}
