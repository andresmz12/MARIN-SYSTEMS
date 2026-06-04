import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: { id: string; taskId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, priority, status, dueDate } = body

  const task = await prisma.companyTask.updateMany({
    where: { id: params.taskId, companyId: params.id, userId: session.user.id },
    data: {
      title,
      description,
      priority,
      status,
      dueDate: dueDate ? new Date(dueDate) : null,
    },
  })

  if (task.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.companyTask.findFirst({ where: { id: params.taskId } })
  return NextResponse.json(updated)
}

export async function DELETE(_: Request, { params }: { params: { id: string; taskId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.companyTask.deleteMany({
    where: { id: params.taskId, companyId: params.id, userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
