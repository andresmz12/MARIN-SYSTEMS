import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMorningReminder } from '@/lib/sendgrid-client'

function isTomorrow(date: Date): boolean {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return (
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()
  )
}

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find instances scheduled for tomorrow with no morning reminder yet
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate())
    const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59)

    const instances = await prisma.taskInstance.findMany({
      where: {
        scheduledDate: { gte: tomorrowStart, lte: tomorrowEnd },
        morningReminderSentAt: null,
        status: 'pending',
      },
      include: {
        corporateTask: true,
      },
    })

    let processed = 0
    let sent = 0
    const errors: string[] = []

    for (const instance of instances) {
      processed++
      const task = instance.corporateTask
      const taskData = { title: task.title, description: task.description, dueDate: instance.scheduledDate, priority: task.priority }

      for (const email of task.employeeEmails) {
        const result = await sendMorningReminder(email, taskData)
        if (result.success) {
          sent++
        } else {
          errors.push(`${instance.id}/${email}: ${result.error}`)
        }
      }

      await prisma.taskInstance.update({
        where: { id: instance.id },
        data: { morningReminderSentAt: new Date() },
      })
    }

    // Also check non-recurring tasks due tomorrow
    const standaloneTasksDueTomorrow = await prisma.corporateTask.findMany({
      where: {
        isRecurring: false,
        dueDate: { gte: tomorrowStart, lte: tomorrowEnd },
        status: 'pending',
      },
    })

    for (const task of standaloneTasksDueTomorrow) {
      processed++
      const taskData = { title: task.title, description: task.description, dueDate: task.dueDate, priority: task.priority }
      for (const email of task.employeeEmails) {
        const result = await sendMorningReminder(email, taskData)
        if (result.success) sent++
        else errors.push(`${task.id}/${email}: ${result.error}`)
      }
    }

    console.log(`[cron/morning] Procesadas: ${processed}, enviadas: ${sent}, errores: ${errors.length}`)
    return NextResponse.json({ processed, sent, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('[cron/morning]', err)
    return NextResponse.json({ error: 'Error en cron morning' }, { status: 500 })
  }
}
