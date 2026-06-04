import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { JournalSchema } from '@/lib/schemas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const month = searchParams.get('month')

  const where: Record<string, unknown> = { userId: session.user.id }

  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  if (date) {
    where.date = {
      gte: new Date(`${date}T00:00:00-05:00`),
      lte: new Date(`${date}T23:59:59-05:00`),
    }
  } else if (fromStr || toStr) {
    const dateFilter: Record<string, Date> = {}
    if (fromStr) dateFilter.gte = new Date(fromStr + 'T00:00:00')
    if (toStr) dateFilter.lte = new Date(toStr + 'T23:59:59')
    where.date = dateFilter
  } else if (month) {
    const [year, m] = month.split('-').map(Number)
    where.date = {
      gte: new Date(year, m - 1, 1),
      lte: new Date(year, m, 0, 23, 59, 59),
    }
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    orderBy: { date: 'desc' },
  })

  return NextResponse.json(entries)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = JournalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { date, mood, content, tags } = parsed.data

    const entryDate = new Date(`${date}T12:00:00-05:00`)

    const entry = await prisma.journalEntry.upsert({
      where: { userId_date: { userId: session.user.id, date: entryDate } },
      update: { mood, content, tags: tags ?? [] },
      create: { userId: session.user.id, date: entryDate, mood, content, tags: tags ?? [] },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al guardar entrada' }, { status: 500 })
  }
}
