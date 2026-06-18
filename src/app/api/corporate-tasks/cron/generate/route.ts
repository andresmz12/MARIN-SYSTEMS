import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateRecurringInstances, RecurringRule } from '@/lib/recurring-tasks'

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
      const instanceDates = generateRecurringInstances(
        now,
        task.dueDate,
        task.recurringRule as RecurringRule,
        task.recurringEndDate!,
      )

      for (const date of instanceDates) {
        try {
          await prisma.taskInstance.upsert({
            where: { corporateTaskId_scheduledDate: { corporateTaskId: task.id, scheduledDate: date } },
            create: { corporateTaskId: task.id, scheduledDate: date },
            update: {},
          })
          created++
        } catch {
          // ignore duplicates
        }
      }
    }

    console.log(`[cron/generate] Procesadas: ${processed} tareas, instancias generadas: ${created}`)
    return NextResponse.json({ processed, created })
  } catch (err) {
    console.error('[cron/generate]', err)
    return NextResponse.json({ error: 'Error generando instancias' }, { status: 500 })
  }
}
