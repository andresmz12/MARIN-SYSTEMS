import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const habit = await prisma.habit.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!habit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.habit.update({
    where: { id: params.id },
    data: {
      name: body.name ?? habit.name,
      emoji: body.emoji ?? habit.emoji,
      category: body.category ?? habit.category,
      frequency: body.frequency ?? habit.frequency,
      isPreMarket: body.isPreMarket !== undefined ? Boolean(body.isPreMarket) : habit.isPreMarket,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const habit = await prisma.habit.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!habit) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.habit.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
