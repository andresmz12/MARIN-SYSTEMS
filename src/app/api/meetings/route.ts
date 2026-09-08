import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meetings = await prisma.meeting.findMany({
    where: { userId: session.user.id },
    orderBy: { date: 'desc' },
    include: {
      company: { select: { id: true, name: true, color: true, emoji: true } },
      tasks: { select: { id: true, done: true } },
    },
  })
  return NextResponse.json(meetings)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { title?: unknown; date?: unknown; companyId?: unknown } | null
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Reunión sin título'
  const date = typeof body?.date === 'string' && !isNaN(Date.parse(body.date)) ? new Date(body.date) : new Date()
  const companyId = typeof body?.companyId === 'string' && body.companyId ? body.companyId : null

  const meeting = await prisma.meeting.create({
    data: { userId: session.user.id, title, date, companyId, pages: [] },
  })
  return NextResponse.json(meeting, { status: 201 })
}
