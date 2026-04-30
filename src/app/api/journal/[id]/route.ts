import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.journalEntry.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.journalEntry.update({
    where: { id: params.id },
    data: {
      mood: body.mood !== undefined ? parseInt(body.mood) : entry.mood,
      content: body.content ?? entry.content,
      tags: body.tags ?? entry.tags,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entry = await prisma.journalEntry.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.journalEntry.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
