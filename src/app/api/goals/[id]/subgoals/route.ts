import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const goal = await prisma.goal.findFirst({ where: { id: params.id, userId: session.user.id } })
  if (!goal) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { title } = await req.json()
  if (!title) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })

  const subGoal = await prisma.subGoal.create({
    data: { goalId: params.id, title },
  })

  return NextResponse.json(subGoal, { status: 201 })
}
