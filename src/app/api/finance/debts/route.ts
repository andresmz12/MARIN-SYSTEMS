import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(1).max(100),
  originalAmount: z.number().positive(),
  remainingAmount: z.number().min(0),
  interestRate: z.number().min(0).default(0),
  monthlyPayment: z.number().min(0).default(0),
  startDate: z.string(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const debts = await prisma.debt.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(debts)
  } catch (err) {
    console.error('[finance/debts GET]', err)
    return NextResponse.json({ error: 'Error al obtener deudas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const { startDate, ...rest } = parsed.data
    const debt = await prisma.debt.create({
      data: { userId: session.user.id, startDate: new Date(startDate), ...rest },
    })
    return NextResponse.json(debt, { status: 201 })
  } catch (err) {
    console.error('[finance/debts POST]', err)
    return NextResponse.json({ error: 'Error al crear deuda' }, { status: 500 })
  }
}
