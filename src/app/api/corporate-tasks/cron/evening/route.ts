import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEveningReminder } from '@/lib/sendgrid-client'

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // Recurring instances due today that are still pending
    const instances = await prisma.taskInstance.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        eveningReminderSentAt: null,
        status: 'pending',
      },
      include: { corporateTask: true },
    })

    let processed = 0
    let sent = 0
    const errors: string[] = []

    for (const instance of instances) {
      processed++
      const task = instance.corporateTask
      const taskData = { title: task.title, description: task.description, dueDate: instance.scheduledDate, priority: task.priority }

      for (const email of task.employeeEmails) {
        const result = await sendEveningReminder(email, taskData)
        if (result.success) sent++
        else errors.push(`${instance.id}/${email}: ${result.error}`)
      }

      await prisma.taskInstance.update({
        where: { id: instance.id },
        data: { eveningReminderSentAt: new Date() },
      })
    }

    // Non-recurring tasks due today
    const standaloneTasksDueToday = await prisma.corporateTask.findMany({
      where: {
        isRecurring: false,
        dueDate: { gte: todayStart, lte: todayEnd },
        status: 'pending',
      },
    })

    for (const task of standaloneTasksDueToday) {
      processed++
      const taskData = { title: task.title, description: task.description, dueDate: task.dueDate, priority: task.priority }
      for (const email of task.employeeEmails) {
        const result = await sendEveningReminder(email, taskData)
        if (result.success) sent++
        else errors.push(`${task.id}/${email}: ${result.error}`)
      }
    }

    console.log(`[cron/evening] Procesadas: ${processed}, enviadas: ${sent}, errores: ${errors.length}`)
    return NextResponse.json({ processed, sent, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('[cron/evening]', err)
    return NextResponse.json({ error: 'Error en cron evening' }, { status: 500 })
  }
}
