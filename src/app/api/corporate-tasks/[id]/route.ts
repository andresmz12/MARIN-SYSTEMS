import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getTaskForUser(id: string, userId: string) {
  return prisma.corporateTask.findFirst({
    where: { id, company: { userId } },
    include: { company: { select: { id: true, name: true, emoji: true, color: true } }, instances: { orderBy: { scheduledDate: 'asc' } } },
  })
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await getTaskForUser(params.id, session.user.id)
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  return NextResponse.json(task)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await getTaskForUser(params.id, session.user.id)
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  if (task.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden editar tareas pendientes' }, { status: 400 })

  try {
    const body = await req.json()
    const updated = await prisma.corporateTask.update({
      where: { id: params.id },
      data: {
        title: body.title?.trim() ?? task.title,
        description: body.description?.trim() ?? task.description,
        priority: body.priority ?? task.priority,
        dueDate: body.dueDate ? new Date(body.dueDate) : task.dueDate,
        employeeEmails: body.employeeEmails ?? task.employeeEmails,
        attachmentUrl: body.attachmentUrl?.trim() || task.attachmentUrl,
        internalNotes: body.internalNotes?.trim() ?? task.internalNotes,
        isRecurring: body.isRecurring ?? task.isRecurring,
        recurringRule: body.recurringRule ?? task.recurringRule,
        recurringEndDate: body.recurringEndDate ? new Date(body.recurringEndDate) : task.recurringEndDate,
      },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[corporate-tasks PUT]', err)
    return NextResponse.json({ error: 'Error al actualizar tarea' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await getTaskForUser(params.id, session.user.id)
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  if (task.status !== 'pending') return NextResponse.json({ error: 'Solo se pueden eliminar tareas pendientes' }, { status: 400 })

  try {
    await prisma.corporateTask.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[corporate-tasks DELETE]', err)
    return NextResponse.json({ error: 'Error al eliminar tarea' }, { status: 500 })
  }
}
