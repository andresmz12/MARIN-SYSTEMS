import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(1).max(100).optional(),
  originalAmount: z.number().positive().optional(),
  remainingAmount: z.number().min(0).optional(),
  interestRate: z.number().min(0).optional(),
  monthlyPayment: z.number().min(0).optional(),
  startDate: z.string().optional(),
  status: z.enum(['active', 'paid']).optional(),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const { startDate, ...rest } = parsed.data
    const result = await prisma.debt.updateMany({
      where: { id: params.id, userId: session.user.id },
      data: { ...rest, ...(startDate ? { startDate: new Date(startDate) } : {}) },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[finance/debts PUT]', err)
    return NextResponse.json({ error: 'Error al actualizar deuda' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await prisma.debt.deleteMany({
      where: { id: params.id, userId: session.user.id },
    })
    if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[finance/debts DELETE]', err)
    return NextResponse.json({ error: 'Error al eliminar deuda' }, { status: 500 })
  }
}
