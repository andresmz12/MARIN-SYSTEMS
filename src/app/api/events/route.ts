import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Record<string, unknown> = { userId: session.user.id }

  if (from || to) {
    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.gte = new Date(`${from}T00:00:00-05:00`)
    if (to) dateFilter.lte = new Date(`${to}T23:59:59-05:00`)
    where.date = dateFilter
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(events, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, date, time, type, notes, isForexNews, forexPair } = body

  if (!title || !date || !type) {
    return NextResponse.json({ error: 'Título, fecha y tipo son requeridos' }, { status: 400 })
  }

  const event = await prisma.event.create({
    data: {
      userId: session.user.id,
      title,
      date: new Date(`${date}T12:00:00-05:00`),
      time: time || null,
      type,
      notes: notes || null,
      isForexNews: Boolean(isForexNews),
      forexPair: forexPair || null,
    },
  })

  return NextResponse.json(event, { status: 201 })
}
