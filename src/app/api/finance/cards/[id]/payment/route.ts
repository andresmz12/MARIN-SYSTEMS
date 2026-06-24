import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  amount: z.number().positive(),
  accountId: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })

  const { amount, accountId } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const card = await tx.creditCard.findFirst({
        where: { id: params.id, userId: session.user.id },
      })
      if (!card) throw new Error('Card not found')

      const newUsed = Math.max(0, card.usedAmount - amount)
      await tx.creditCard.update({
        where: { id: params.id },
        data: { usedAmount: newUsed },
      })

      if (accountId) {
        const account = await tx.financeAccount.findFirst({
          where: { id: accountId, userId: session.user.id },
        })
        if (!account) throw new Error('Account not found')
        await tx.financeAccount.update({
          where: { id: accountId },
          data: { balance: { decrement: amount } },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[finance/cards payment POST]', err)
    return NextResponse.json({ error: 'Error al registrar pago' }, { status: 500 })
  }
}
