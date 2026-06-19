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
    const instances = await prisma.taskInstance.findMany({
      where: {
        scheduledDate: { gte: todayStart, lte: todayEnd },
        morningReminderSentAt: null,
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

    const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`

    type EmailEntry = {
      titulo: string
      empresa: string
      scheduledDate: Date
      instanceId?: string
    }
    const emailTaskMap = new Map<string, EmailEntry[]>()

    for (const instance of instances) {
      const task = instance.corporateTask
      for (const email of task.employeeEmails) {
        const entry = emailTaskMap.get(email) ?? []
        entry.push({ titulo: task.title, empresa: task.company.name, scheduledDate: instance.scheduledDate, instanceId: instance.id })
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
      console.log('[cron/morning] No hay tareas para HOY — sin envíos')
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
        instanceId: e.instanceId ?? null,
        completeUrl: e.instanceId ? `${BASE_URL}/api/corporate-tasks/complete/${e.instanceId}` : null,
      })),
    }))

    let notified = 0
    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'morning', fecha: new Date().toISOString(), tareas }),
      })
      if (res.ok) {
        notified = tareas.length
        // Mark instances as notified so midday/evening can filter on this
        const instanceIds = Array.from(emailTaskMap.values())
          .flat()
          .map((e) => e.instanceId)
          .filter((id): id is string => !!id)
        if (instanceIds.length > 0) {
          await prisma.taskInstance.updateMany({
            where: { id: { in: instanceIds } },
            data: { morningReminderSentAt: new Date() },
          })
        }
        console.log(`[cron/morning] Webhook n8n OK — ${notified} empleado(s) notificados`)
      } else {
        console.error(`[cron/morning] Webhook n8n respondió ${res.status}`)
      }
    } catch (webhookErr) {
      console.error('[cron/morning] Error notificando webhook n8n:', webhookErr instanceof Error ? webhookErr.message : webhookErr)
    }

    return NextResponse.json({ processed: emailTaskMap.size, notified })
  } catch (err) {
    console.error('[cron/morning]', err)
    return NextResponse.json({ error: 'Error en cron morning' }, { status: 500 })
  }
}
