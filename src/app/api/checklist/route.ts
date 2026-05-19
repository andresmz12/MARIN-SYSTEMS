import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const DEFAULT_ITEMS = {
  personal: [false, false, false, false],
  setup: [false, false, false, false],
  riesgo: [false, false, false],
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const checklist = await prisma.preTradeChecklist.findFirst({
    where: {
      userId: session.user.id,
      date: {
        gte: new Date(`${date}T00:00:00-05:00`),
        lte: new Date(`${date}T23:59:59-05:00`),
      },
    },
  })

  if (!checklist) {
    return NextResponse.json({ items: DEFAULT_ITEMS }, { headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(checklist, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { items, date } = body

  const dateStr = date || new Date().toISOString().split('T')[0]
  const checklistDate = new Date(`${dateStr}T12:00:00-05:00`)

  const checklist = await prisma.preTradeChecklist.upsert({
    where: { userId_date: { userId: session.user.id, date: checklistDate } },
    update: { items },
    create: {
      userId: session.user.id,
      date: checklistDate,
      items,
    },
  })

  return NextResponse.json(checklist)
}
