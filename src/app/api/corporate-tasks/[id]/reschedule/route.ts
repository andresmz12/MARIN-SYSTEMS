import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateDailyInstancesForTask, generateRecurringInstances, RecurringRule } from '@/lib/recurring-tasks'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.corporateTask.findFirst({
    where: { id: params.id, company: { userId: session.user.id } },
  })
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  try {
    const { newDueDate } = await req.json()
    if (!newDueDate) return NextResponse.json({ error: 'newDueDate es requerido' }, { status: 400 })

    const due = new Date(newDueDate)
    if (isNaN(due.getTime())) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    if (due <= new Date()) return NextResponse.json({ error: 'La nueva fecha debe ser futura' }, { status: 400 })

    await prisma.corporateTask.update({ where: { id: params.id }, data: { dueDate: due } })

    // Delete pending instances and regenerate from today
    await prisma.taskInstance.deleteMany({ where: { corporateTaskId: params.id, status: 'pending' } })

    const now = new Date()
    let instanceDates: Date[]

    if (!task.isRecurring) {
      instanceDates = generateDailyInstancesForTask(now, due)
    } else if (task.recurringRule && task.recurringEndDate) {
      instanceDates = generateRecurringInstances(now, due, task.recurringRule as RecurringRule, task.recurringEndDate)
    } else {
      instanceDates = generateDailyInstancesForTask(now, due)
    }

    if (instanceDates.length > 0) {
      await prisma.taskInstance.createMany({
        data: instanceDates.map((date) => ({ corporateTaskId: params.id, scheduledDate: date })),
        skipDuplicates: true,
      })
    }

    console.log(`[reschedule] Tarea "${task.title}" movida a ${due.toISOString().slice(0, 10)} — ${instanceDates.length} instancias regeneradas`)
    return NextResponse.json({ id: params.id, newDueDate: due })
  } catch (err) {
    console.error('[reschedule]', err)
    return NextResponse.json({ error: 'Error al reprogramar tarea' }, { status: 500 })
  }
}
