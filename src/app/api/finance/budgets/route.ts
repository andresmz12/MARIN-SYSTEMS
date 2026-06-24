import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  categoryId: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  plannedAmount: z.number().positive(),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = new URL(req.url).searchParams.get('month')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { userId: session.user.id }
  if (month) where.month = month

  try {
    const budgets = await prisma.budget.findMany({
      where,
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    })
    return NextResponse.json(budgets)
  } catch (err) {
    console.error('[finance/budgets GET]', err)
    return NextResponse.json({ error: 'Error al obtener presupuestos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  try {
    const budget = await prisma.budget.upsert({
      where: {
        categoryId_month: {
          categoryId: parsed.data.categoryId,
          month: parsed.data.month,
        },
      },
      update: { plannedAmount: parsed.data.plannedAmount },
      create: { userId: session.user.id, ...parsed.data },
    })
    return NextResponse.json(budget, { status: 201 })
  } catch (err) {
    console.error('[finance/budgets POST]', err)
    return NextResponse.json({ error: 'Error al guardar presupuesto' }, { status: 500 })
  }
}
