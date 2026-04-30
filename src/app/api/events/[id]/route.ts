import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.event.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.event.update({
    where: { id: params.id },
    data: {
      title: body.title ?? event.title,
      date: body.date ? new Date(`${body.date}T12:00:00-05:00`) : event.date,
      time: body.time ?? event.time,
      type: body.type ?? event.type,
      notes: body.notes ?? event.notes,
      isForexNews: body.isForexNews !== undefined ? Boolean(body.isForexNews) : event.isForexNews,
      forexPair: body.forexPair ?? event.forexPair,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.event.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.event.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
