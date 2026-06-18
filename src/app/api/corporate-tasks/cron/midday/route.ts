import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
    // Only tasks already notified in the morning that are still pending
    const instances = await prisma.taskInstance.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        morningReminderSentAt: { not: null },
        status: 'pending',
      },
      include: { corporateTask: { include: { company: { select: { name: true } } } } },
    })

    const standaloneTasks = await prisma.corporateTask.findMany({
      where: {
        isRecurring: false,
        dueDate: { gte: todayStart, lte: todayEnd },
        status: 'pending',
      },
      include: { company: { select: { name: true } } },
    })

    type EmailEntry = {
      titulo: string
      empresa: string
      scheduledDate: Date
    }
    const emailTaskMap = new Map<string, EmailEntry[]>()

    for (const instance of instances) {
      const task = instance.corporateTask
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({ titulo: task.title, empresa: task.company.name, scheduledDate: instance.scheduledDate })
        emailTaskMap.set(email, entry)
      }
    }

    for (const task of standaloneTasks) {
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({ titulo: task.title, empresa: task.company.name, scheduledDate: task.dueDate })
        emailTaskMap.set(email, entry)
      }
    }

    if (emailTaskMap.size === 0) {
      console.log('[cron/midday] No hay tareas pendientes para HOY — sin envíos')
      return NextResponse.json({ processed: 0, notified: 0 })
    }

    const tareas = Array.from(emailTaskMap.entries()).map(([email, entries]) => ({
      empleado: email,
      email,
      items: entries.map((e) => ({
        titulo: e.titulo,
        empresa: e.empresa,
        scheduledDate: e.scheduledDate.toISOString(),
        status: 'pending',
      })),
    }))

    let notified = 0
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'midday', fecha: new Date().toISOString(), tareas }),
      })
      if (res.ok) {
        notified = tareas.length
        console.log(`[cron/midday] Webhook n8n OK — ${notified} empleado(s) notificados`)
      } else {
        console.error(`[cron/midday] Webhook n8n respondió ${res.status}`)
      }
    } catch (webhookErr) {
      console.error('[cron/midday] Error notificando webhook n8n:', webhookErr instanceof Error ? webhookErr.message : webhookErr)
    }

    return NextResponse.json({ processed: emailTaskMap.size, notified })
  } catch (err) {
    console.error('[cron/midday]', err)
    return NextResponse.json({ error: 'Error en cron midday' }, { status: 500 })
  }
}
