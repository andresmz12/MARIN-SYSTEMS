import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEveningReminder } from '@/lib/sendgrid-client'

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? 'https://n8n-production-c601.up.railway.app/webhook/marin-tasks'

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
    // Recurring instances due TODAY, still pending, no evening reminder yet
    const instances = await prisma.taskInstance.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        eveningReminderSentAt: null,
        status: 'pending',
      },
      include: { corporateTask: { include: { company: { select: { name: true } } } } },
    })

    // Non-recurring tasks due TODAY, still pending
    const standaloneTasks = await prisma.corporateTask.findMany({
      where: {
        isRecurring: false,
        dueDate: { gte: todayStart, lte: todayEnd },
        status: 'pending',
      },
      include: { company: { select: { name: true } } },
    })

    type EmailEntry = {
      taskData: { title: string; description: string; dueDate: Date; priority: string }
      instanceId?: string
      empresa: string
      scheduledDate: Date
    }
    // Build map: email → list of task data
    const emailTaskMap = new Map<string, EmailEntry[]>()

    for (const instance of instances) {
      const task = instance.corporateTask
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({
          taskData: { title: task.title, description: task.description, dueDate: instance.scheduledDate, priority: task.priority },
          instanceId: instance.id,
          empresa: task.company.name,
          scheduledDate: instance.scheduledDate,
        })
        emailTaskMap.set(email, entry)
      }
    }

    for (const task of standaloneTasks) {
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({
          taskData: { title: task.title, description: task.description, dueDate: task.dueDate, priority: task.priority },
          empresa: task.company.name,
          scheduledDate: task.dueDate,
        })
        emailTaskMap.set(email, entry)
      }
    }

    if (emailTaskMap.size === 0) {
      console.log('[cron/evening] No hay tareas pendientes para HOY — sin envíos')
      return NextResponse.json({ processed: 0, sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const [email, entries] of Array.from(emailTaskMap.entries())) {
      try {
        const tasks = entries.map((e: EmailEntry) => e.taskData)
        const result = await sendEveningReminder(email, tasks)

        if (result.success) {
          sent++
          const instanceIds = entries.map((e: EmailEntry) => e.instanceId).filter((id: string | undefined): id is string => !!id)
          if (instanceIds.length > 0) {
            await prisma.taskInstance.updateMany({
              where: { id: { in: instanceIds } },
              data: { eveningReminderSentAt: new Date() },
            })
          }
        } else {
          errors.push(`${email}: ${result.error}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error desconocido'
        console.error(`[cron/evening] Error procesando ${email}: ${msg}`)
        errors.push(`${email}: ${msg}`)
      }
    }

    // Notify n8n webhook with all tasks grouped by employee
    try {
      const tareas = Array.from(emailTaskMap.entries()).map(([email, entries]) => ({
        empleado: email,
        email,
        items: entries.map((e: EmailEntry) => ({
          titulo: e.taskData.title,
          empresa: e.empresa,
          scheduledDate: e.scheduledDate.toISOString(),
          status: 'pending',
        })),
      }))

      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'evening', fecha: new Date().toISOString(), tareas }),
      })
      console.log(`[cron/evening] Webhook n8n notificado con ${tareas.length} empleado(s)`)
    } catch (webhookErr) {
      console.error('[cron/evening] Error notificando webhook n8n:', webhookErr instanceof Error ? webhookErr.message : webhookErr)
    }

    console.log(`[cron/evening] Procesados: ${emailTaskMap.size} emails, enviados: ${sent}, errores: ${errors.length}`)
    return NextResponse.json({ processed: emailTaskMap.size, sent, errors: errors.length > 0 ? errors : undefined })
  } catch (err) {
    console.error('[cron/evening]', err)
    return NextResponse.json({ error: 'Error en cron evening' }, { status: 500 })
  }
}
