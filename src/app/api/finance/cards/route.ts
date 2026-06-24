import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(1).max(100),
  creditLimit: z.number().positive(),
  usedAmount: z.number().min(0).default(0),
  interestRate: z.number().min(0).default(0),
  cutoffDay: z.number().int().min(1).max(31),
  paymentDay: z.number().int().min(1).max(31),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const cards = await prisma.creditCard.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(cards)
  } catch (err) {
    console.error('[finance/cards GET]', err)
    return NextResponse.json({ error: 'Error al obtener tarjetas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const card = await prisma.creditCard.create({
      data: { userId: session.user.id, ...parsed.data },
    })
    return NextResponse.json(card, { status: 201 })
  } catch (err) {
    console.error('[finance/cards POST]', err)
    return NextResponse.json({ error: 'Error al crear tarjeta' }, { status: 500 })
  }
}
