import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  date: z.string().optional(),
  amount: z.number().positive().optional(),
  type: z.enum(['income', 'expense']).optional(),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  isRecurring: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const existing = await prisma.financeTransaction.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { date, amount, type, accountId, creditCardId, ...rest } = parsed.data
  const newAmount = amount ?? existing.amount
  const newType = type ?? existing.type
  const newAccountId = accountId !== undefined ? accountId : existing.accountId
  const newCreditCardId = creditCardId !== undefined ? creditCardId : existing.creditCardId

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      // Reverse old balance effect
      if (existing.accountId) {
        await tx.financeAccount.updateMany({
          where: { id: existing.accountId, userId: session.user.id },
          data: { balance: { increment: existing.type === 'income' ? -existing.amount : existing.amount } },
        })
      }
      if (existing.creditCardId && existing.type === 'expense') {
        await tx.creditCard.updateMany({
          where: { id: existing.creditCardId, userId: session.user.id },
          data: { usedAmount: { decrement: existing.amount } },
        })
      }

      // Apply new balance effect
      if (newAccountId) {
        await tx.financeAccount.updateMany({
          where: { id: newAccountId, userId: session.user.id },
          data: { balance: { increment: newType === 'income' ? newAmount : -newAmount } },
        })
      }
      if (newCreditCardId && newType === 'expense') {
        await tx.creditCard.updateMany({
          where: { id: newCreditCardId, userId: session.user.id },
          data: { usedAmount: { increment: newAmount } },
        })
      }

      await tx.financeTransaction.update({
        where: { id: params.id },
        data: {
          ...(date ? { date: new Date(date) } : {}),
          amount: newAmount,
          type: newType,
          accountId: newAccountId,
          creditCardId: newCreditCardId,
          ...rest,
        },
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[finance/transactions PUT]', err)
    return NextResponse.json({ error: 'Error al actualizar transacción' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.financeTransaction.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      if (existing.accountId) {
        await tx.financeAccount.updateMany({
          where: { id: existing.accountId, userId: session.user.id },
          data: { balance: { increment: existing.type === 'income' ? -existing.amount : existing.amount } },
        })
      }
      if (existing.creditCardId && existing.type === 'expense') {
        await tx.creditCard.updateMany({
          where: { id: existing.creditCardId, userId: session.user.id },
          data: { usedAmount: { decrement: existing.amount } },
        })
      }
      await tx.financeTransaction.delete({ where: { id: params.id } })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[finance/transactions DELETE]', err)
    return NextResponse.json({ error: 'Error al eliminar transacción' }, { status: 500 })
  }
}
