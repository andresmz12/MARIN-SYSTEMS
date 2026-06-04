import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 1) {
    return NextResponse.json({ events: [], companies: [], journal: [], habits: [] })
  }

  const userId = session.user.id

  try {
    const [events, companies, journal, habits] = await Promise.all([
      prisma.event.findMany({
        where: { userId, title: { contains: q, mode: 'insensitive' } },
        orderBy: { date: 'desc' },
        take: 4,
        select: { id: true, title: true, date: true, time: true, type: true },
      }),
      prisma.company.findMany({
        where: { userId, name: { contains: q, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, name: true, emoji: true, status: true, industry: true },
      }),
      prisma.journalEntry.findMany({
        where: { userId, content: { contains: q, mode: 'insensitive' } },
        orderBy: { date: 'desc' },
        take: 4,
        select: { id: true, date: true, mood: true, content: true },
      }),
      prisma.habit.findMany({
        where: { userId, name: { contains: q, mode: 'insensitive' } },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, name: true, emoji: true, category: true },
      }),
    ])

    return NextResponse.json({ events, companies, journal, habits }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al buscar' }, { status: 500 })
  }
}
