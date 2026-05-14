import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tasks = await prisma.companyTask.findMany({
    where: { companyId: params.id, userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(tasks)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, priority, status, dueDate } = body

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const task = await prisma.companyTask.create({
    data: {
      companyId: params.id,
      userId: session.user.id,
      title,
      description: description || null,
      priority: priority || 'media',
      status: status || 'pendiente',
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  })

  return NextResponse.json(task, { status: 201 })
}
