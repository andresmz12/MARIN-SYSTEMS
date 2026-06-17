import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTaskEmail } from '@/lib/sendgrid-client'
import { generateNextOccurrences, RecurringRule } from '@/lib/recurring-tasks'

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  try {
    const recurringTasks = await prisma.corporateTask.findMany({
      where: {
        isRecurring: true,
        recurringRule: { not: null },
        recurringEndDate: { gt: now },
      },
    })

    let processed = 0
    let sent = 0
    const errors: string[] = []

    for (const task of recurringTasks) {
      processed++
      try {
        const occurrences = generateNextOccurrences(
          task.dueDate,
          task.recurringRule as RecurringRule,
          task.recurringEndDate!,
          30,
        )

        for (const date of occurrences) {
          await prisma.taskInstance.upsert({
            where: { corporateTaskId_scheduledDate: { corporateTaskId: task.id, scheduledDate: date } },
            create: { corporateTaskId: task.id, scheduledDate: date, status: 'pending' },
            update: {},
          })
        }

        // Send any instances due today or past
        const dueTodayInstances = await prisma.taskInstance.findMany({
          where: { corporateTaskId: task.id, scheduledDate: { lte: now }, status: 'pending' },
        })

        for (const instance of dueTodayInstances) {
          const taskData = {
            title: task.title,
            description: task.description,
            dueDate: instance.scheduledDate,
            priority: task.priority,
          }

          let allSent = true
          for (const email of task.employeeEmails) {
            const result = await sendTaskEmail(email, taskData, task.attachmentUrl ?? undefined)
            if (!result.success) {
              allSent = false
              errors.push(`${task.id}/${email}: ${result.error}`)
            }
          }

          if (allSent || task.employeeEmails.length === 0) {
            await prisma.taskInstance.update({
              where: { id: instance.id },
              data: { status: 'sent', sentAt: now },
            })
            sent++
          }
        }
      } catch (taskErr) {
        errors.push(`Task ${task.id}: ${taskErr instanceof Error ? taskErr.message : 'unknown'}`)
      }
    }

    return NextResponse.json({ processed, sent, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('[cron]', err)
    return NextResponse.json({ error: 'Error en cron' }, { status: 500 })
  }
}
