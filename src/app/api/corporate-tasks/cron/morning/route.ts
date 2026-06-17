import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMorningReminder } from '@/lib/sendgrid-client'

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  try {
    // Recurring instances due TODAY with no morning reminder yet
    const instances = await prisma.taskInstance.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        morningReminderSentAt: null,
        status: 'pending',
      },
      include: { corporateTask: true },
    })

    // Non-recurring tasks due TODAY
    const standaloneTasks = await prisma.corporateTask.findMany({
      where: {
        isRecurring: false,
        dueDate: { gte: todayStart, lte: todayEnd },
        status: 'pending',
      },
    })

    type EmailEntry = { taskData: { title: string; description: string; dueDate: Date; priority: string }; instanceId?: string }
    // Build a map: email → list of task data
    const emailTaskMap = new Map<string, EmailEntry[]>()

    for (const instance of instances) {
      const task = instance.corporateTask
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({
          taskData: { title: task.title, description: task.description, dueDate: instance.scheduledDate, priority: task.priority },
          instanceId: instance.id,
        })
        emailTaskMap.set(email, entry)
      }
    }

    for (const task of standaloneTasks) {
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({ taskData: { title: task.title, description: task.description, dueDate: task.dueDate, priority: task.priority } })
        emailTaskMap.set(email, entry)
      }
    }

    if (emailTaskMap.size === 0) {
      console.log('[cron/morning] No hay tareas para HOY — sin envíos')
      return NextResponse.json({ processed: 0, sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const [email, entries] of Array.from(emailTaskMap.entries())) {
      try {
        const tasks = entries.map((e: EmailEntry) => e.taskData)
        const result = await sendMorningReminder(email, tasks)

        if (result.success) {
          sent++
          // Update morningReminderSentAt only for successfully sent instances
          const instanceIds = entries.map((e: EmailEntry) => e.instanceId).filter((id: string | undefined): id is string => !!id)
          if (instanceIds.length > 0) {
            await prisma.taskInstance.updateMany({
              where: { id: { in: instanceIds } },
              data: { morningReminderSentAt: new Date() },
            })
          }
        } else {
          errors.push(`${email}: ${result.error}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error desconocido'
        console.error(`[cron/morning] Error procesando ${email}: ${msg}`)
        errors.push(`${email}: ${msg}`)
      }
    }

    console.log(`[cron/morning] Procesados: ${emailTaskMap.size} emails, enviados: ${sent}, errores: ${errors.length}`)
    return NextResponse.json({ processed: emailTaskMap.size, sent, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('[cron/morning]', err)
    return NextResponse.json({ error: 'Error en cron morning' }, { status: 500 })
  }
}
