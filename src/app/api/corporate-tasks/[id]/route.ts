import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateDailyInstancesForTask, generateRecurringInstances, RecurringRule } from '@/lib/recurring-tasks'

async function getTaskForUser(id: string, userId: string) {
  return prisma.corporateTask.findFirst({
    where: { id, company: { userId } },
    include: {
      company: { select: { id: true, name: true, emoji: true, color: true } },
      instances: { orderBy: { scheduledDate: 'asc' } },
    },
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
    const newStartDate = body.startDate ? new Date(body.startDate) : task.startDate
    const newDueDate = body.dueDate ? new Date(body.dueDate) : task.dueDate
    const newIsRecurring = body.isRecurring ?? task.isRecurring
    const newRecurringRule = body.recurringRule ?? task.recurringRule
    const newRecurringEndDate = body.recurringEndDate ? new Date(body.recurringEndDate) : task.recurringEndDate

    if (newStartDate > newDueDate) {
      return NextResponse.json({ error: 'La fecha de inicio debe ser anterior o igual a la fecha límite' }, { status: 400 })
    }

    const updated = await prisma.corporateTask.update({
      where: { id: params.id },
      data: {
        title: body.title?.trim() ?? task.title,
        description: body.description?.trim() ?? task.description,
        priority: body.priority ?? task.priority,
        startDate: newStartDate,
        dueDate: newDueDate,
        employeeEmails: body.employeeEmails ?? task.employeeEmails,
        attachmentUrl: body.attachmentUrl?.trim() || task.attachmentUrl,
        internalNotes: body.internalNotes?.trim() ?? task.internalNotes,
        isRecurring: newIsRecurring,
        recurringRule: newIsRecurring ? newRecurringRule : null,
        recurringEndDate: newIsRecurring ? newRecurringEndDate : null,
      },
    })

    // Regenerar instancias si cambiaron las fechas o la recurrencia
    const datesChanged = newStartDate.getTime() !== task.startDate.getTime() || newDueDate.getTime() !== task.dueDate.getTime()
    if (datesChanged || newIsRecurring !== task.isRecurring) {
      await prisma.taskInstance.deleteMany({ where: { corporateTaskId: params.id, status: 'pending' } })
      const instanceDates = newIsRecurring && newRecurringRule && newRecurringEndDate
        ? generateRecurringInstances(newStartDate, newDueDate, newRecurringRule as RecurringRule, newRecurringEndDate)
        : generateDailyInstancesForTask(newStartDate, newDueDate)
      if (instanceDates.length > 0) {
        await prisma.taskInstance.createMany({
          data: instanceDates.map((date) => ({ corporateTaskId: params.id, scheduledDate: date })),
          skipDuplicates: true,
        })
      }
      console.log('[corporate-tasks PUT] Instancias regeneradas: ' + instanceDates.length)
    }

    return NextResponse.json({ id: updated.id, updated: true })
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

  try {
    await prisma.corporateTask.delete({ where: { id: params.id } })
    return NextResponse.json({ id: params.id, deleted: true })
  } catch (err) {
    console.error('[corporate-tasks DELETE]', err)
    return NextResponse.json({ error: 'Error al eliminar tarea' }, { status: 500 })
  }
}
