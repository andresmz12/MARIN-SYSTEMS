import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const habitId = searchParams.get('habitId')

  const daysBack = 84
  const since = new Date()
  since.setDate(since.getDate() - daysBack)

  const where: Record<string, unknown> = {
    userId: session.user.id,
    date: { gte: since },
  }
  if (habitId) where.habitId = habitId

  const completions = await prisma.habitCompletion.findMany({
    where,
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(completions)
}
