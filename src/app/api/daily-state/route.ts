import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const state = await prisma.dailyState.findFirst({
    where: {
      userId: session.user.id,
      date: {
        gte: new Date(`${date}T00:00:00-05:00`),
        lte: new Date(`${date}T23:59:59-05:00`),
      },
    },
  })

  return NextResponse.json(state)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, mentalState, rutinaCompleted, hasNews } = body

  const dateStr = date || new Date().toISOString().split('T')[0]
  const stateDate = new Date(`${dateStr}T12:00:00-05:00`)

  const state = await prisma.dailyState.upsert({
    where: { userId_date: { userId: session.user.id, date: stateDate } },
    update: {
      mentalState: mentalState !== undefined ? parseInt(mentalState) : undefined,
      rutinaCompleted: rutinaCompleted !== undefined ? Boolean(rutinaCompleted) : undefined,
      hasNews: hasNews !== undefined ? Boolean(hasNews) : undefined,
    },
    create: {
      userId: session.user.id,
      date: stateDate,
      mentalState: mentalState !== undefined ? parseInt(mentalState) : 3,
      rutinaCompleted: Boolean(rutinaCompleted),
      hasNews: Boolean(hasNews),
    },
  })

  return NextResponse.json(state)
}
