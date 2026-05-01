import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function verifyOwnership(subId: string, userId: string) {
  return prisma.subGoal.findFirst({
    where: { id: subId, goal: { userId } },
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; subId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subGoal = await verifyOwnership(params.subId, session.user.id)
  if (!subGoal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { title, completed } = await req.json()

  const updated = await prisma.subGoal.update({
    where: { id: params.subId },
    data: {
      title: title ?? subGoal.title,
      completed: completed !== undefined ? completed : subGoal.completed,
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; subId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subGoal = await verifyOwnership(params.subId, session.user.id)
  if (!subGoal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.subGoal.delete({ where: { id: params.subId } })
  return NextResponse.json({ success: true })
}
