import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
    include: { subGoals: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(goals)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description, deadline } = await req.json()
  if (!title) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })

  const goal = await prisma.goal.create({
    data: {
      userId: session.user.id,
      title,
      description: description ?? null,
      deadline: deadline ? new Date(deadline) : null,
    },
    include: { subGoals: true },
  })

  return NextResponse.json(goal, { status: 201 })
}
