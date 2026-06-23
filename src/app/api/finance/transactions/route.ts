import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  date: z.string(),
  amount: z.number().positive(),
  type: z.enum(['income', 'expense']),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  creditCardId: z.string().optional(),
  note: z.string().max(200).optional(),
  isRecurring: z.boolean().default(false),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') // e.g. "2026-06"
  const categoryId = searchParams.get('categoryId')
  const type = searchParams.get('type') as 'income' | 'expense' | null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { userId: session.user.id }

  if (month) {
    const [year, m] = month.split('-').map(Number)
    const start = new Date(year, m - 1, 1)
    const end = new Date(year, m, 1)
    where.date = { gte: start, lt: end }
  }
  if (categoryId) where.categoryId = categoryId
  if (type) where.type = type

  const transactions = await prisma.financeTransaction.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(transactions)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const { date, accountId, creditCardId, amount, type, ...rest } = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transaction = await prisma.$transaction(async (tx: any) => {
    const t = await tx.financeTransaction.create({
      data: {
        userId: session.user.id,
        date: new Date(date),
        amount,
        type,
        accountId: accountId ?? null,
        creditCardId: creditCardId ?? null,
        ...rest,
      },
    })

    if (accountId) {
      await tx.financeAccount.updateMany({
        where: { id: accountId, userId: session.user.id },
        data: { balance: { increment: type === 'income' ? amount : -amount } },
      })
    }

    if (creditCardId && type === 'expense') {
      await tx.creditCard.updateMany({
        where: { id: creditCardId, userId: session.user.id },
        data: { usedAmount: { increment: amount } },
      })
    }

    return t
  })

  return NextResponse.json(transaction, { status: 201 })
}
