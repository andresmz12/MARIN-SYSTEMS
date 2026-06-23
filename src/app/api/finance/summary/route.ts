import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = new URL(req.url).searchParams.get('month') ?? new Date().toISOString().slice(0, 7)
  const [year, m] = month.split('-').map(Number)
  const start = new Date(year, m - 1, 1)
  const end = new Date(year, m, 1)

  const userId = session.user.id

  const [transactions, accounts, cards, debts] = await Promise.all([
    prisma.financeTransaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { category: true },
    }),
    prisma.financeAccount.findMany({ where: { userId } }),
    prisma.creditCard.findMany({ where: { userId } }),
    prisma.debt.findMany({ where: { userId, status: 'active' } }),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalIncome = transactions
    .filter((t: any) => t.type === 'income')
    .reduce((sum: number, t: any) => sum + t.amount, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalExpenses = transactions
    .filter((t: any) => t.type === 'expense')
    .reduce((sum: number, t: any) => sum + t.amount, 0)

  const netBalance = totalIncome - totalExpenses

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalAccountBalance = accounts.reduce((sum: number, a: any) => sum + a.balance, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalCardDebt = cards.reduce((sum: number, c: any) => sum + c.usedAmount, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalDebtRemaining = debts.reduce((sum: number, d: any) => sum + d.remainingAmount, 0)

  // Spending by category
  const byCategory: Record<string, { name: string; emoji: string; amount: number }> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of transactions.filter((t: any) => t.type === 'expense')) {
    const key = t.categoryId ?? 'sin-categoría'
    if (!byCategory[key]) {
      byCategory[key] = {
        name: t.category?.name ?? 'Sin categoría',
        emoji: t.category?.emoji ?? '📦',
        amount: 0,
      }
    }
    byCategory[key].amount += t.amount
  }

  return NextResponse.json({
    month,
    totalIncome,
    totalExpenses,
    netBalance,
    totalAccountBalance,
    totalCardDebt,
    totalDebtRemaining,
    byCategory: Object.values(byCategory).sort((a, b) => b.amount - a.amount),
  })
}
