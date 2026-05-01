import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const goal = await prisma.goal.findFirst({ where: { id: params.id, userId: session.user.id } })
  if (!goal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { title, description, deadline, completed } = await req.json()

  const updated = await prisma.goal.update({
    where: { id: params.id },
    data: {
      title: title ?? goal.title,
      description: description !== undefined ? description : goal.description,
      deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : goal.deadline,
      completed: completed !== undefined ? completed : goal.completed,
    },
    include: { subGoals: { orderBy: { createdAt: 'asc' } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const goal = await prisma.goal.findFirst({ where: { id: params.id, userId: session.user.id } })
  if (!goal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  await prisma.goal.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
