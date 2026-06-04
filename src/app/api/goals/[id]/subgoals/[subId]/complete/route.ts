import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: { id: string; subId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subGoal = await prisma.subGoal.findFirst({
    where: { id: params.subId, goal: { userId: session.user.id } },
  })
  if (!subGoal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]

  const existing = await prisma.goalCompletion.findUnique({
    where: { subGoalId_date: { subGoalId: params.subId, date: today } },
  })

  if (existing) {
    await prisma.goalCompletion.delete({ where: { id: existing.id } })
    return NextResponse.json({ done: false })
  } else {
    await prisma.goalCompletion.create({ data: { subGoalId: params.subId, date: today } })
    return NextResponse.json({ done: true })
  }
}
