import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDayStart } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const habitId = searchParams.get('habitId')

  const where: Record<string, unknown> = { userId: session.user.id }
  if (habitId) where.habitId = habitId

  if (dateStr) {
    const start = new Date(`${dateStr}T00:00:00-05:00`)
    const end = new Date(`${dateStr}T23:59:59-05:00`)
    where.date = { gte: start, lte: end }
  }

  const completions = await prisma.habitCompletion.findMany({
    where,
    orderBy: { date: 'desc' },
  })

  return NextResponse.json(completions)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { habitId, date } = body

  if (!habitId) return NextResponse.json({ error: 'habitId requerido' }, { status: 400 })

  const habit = await prisma.habit.findFirst({
    where: { id: habitId, userId: session.user.id },
  })
  if (!habit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const dateStr = date || new Date().toISOString().split('T')[0]
  const completionDate = new Date(`${dateStr}T12:00:00-05:00`)

  const existing = await prisma.habitCompletion.findFirst({
    where: {
      habitId,
      userId: session.user.id,
      date: { gte: new Date(`${dateStr}T00:00:00-05:00`), lte: new Date(`${dateStr}T23:59:59-05:00`) },
    },
  })

  if (existing) {
    await prisma.habitCompletion.delete({ where: { id: existing.id } })
    return NextResponse.json({ completed: false })
  }

  const completion = await prisma.habitCompletion.create({
    data: {
      habitId,
      userId: session.user.id,
      date: completionDate,
    },
  })

  return NextResponse.json({ completed: true, completion }, { status: 201 })
}
