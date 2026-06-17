import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateNextOccurrences, RecurringRule } from '@/lib/recurring-tasks'

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const recurringTasks = await prisma.corporateTask.findMany({
      where: { isRecurring: true, recurringRule: { not: null }, recurringEndDate: { gt: now } },
    })

    let processed = 0
    let created = 0

    for (const task of recurringTasks) {
      processed++
      const occurrences = generateNextOccurrences(
        task.dueDate,
        task.recurringRule as RecurringRule,
        task.recurringEndDate!,
        30,
      )

      for (const date of occurrences) {
        try {
          await prisma.taskInstance.upsert({
            where: { corporateTaskId_scheduledDate: { corporateTaskId: task.id, scheduledDate: date } },
            create: { corporateTaskId: task.id, scheduledDate: date },
            update: {},
          })
          created++
        } catch {
          // Ignore duplicates
        }
      }
    }

    console.log(`[cron/generate] Procesadas: ${processed}, instancias generadas: ${created}`)
    return NextResponse.json({ processed, created })
  } catch (err) {
    console.error('[cron/generate]', err)
    return NextResponse.json({ error: 'Error generando instancias' }, { status: 500 })
  }
}
