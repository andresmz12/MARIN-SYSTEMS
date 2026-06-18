import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateDailyInstancesForTask, generateRecurringInstances, RecurringRule } from '@/lib/recurring-tasks'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const month = searchParams.get('month')
  const status = searchParams.get('status')

  const where: Record<string, unknown> = { company: { userId: session.user.id } }
  if (companyId) where.companyId = companyId
  if (status) where.status = status

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const monthStart = new Date(y, m - 1, 1)
    const monthEnd = new Date(y, m, 0, 23, 59, 59)
    // Incluir tareas cuyo rango [startDate, dueDate] se solape con el mes
    where.startDate = { lte: monthEnd }
    where.dueDate = { gte: monthStart }
  }

  try {
    const tasks = await prisma.corporateTask.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, emoji: true, color: true } },
        _count: { select: { instances: true } },
      },
      orderBy: { dueDate: 'asc' },
    })
    return NextResponse.json(tasks)
  } catch (err) {
    console.error('[corporate-tasks GET]', err)
    return NextResponse.json({ error: 'Error al obtener tareas' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const {
      title, description, priority = 'medium', startDate, dueDate, companyId,
      employeeEmails = [], attachmentUrl, internalNotes,
      isRecurring = false, recurringRule, recurringEndDate,
    } = body

    if (!title?.trim()) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
    if (!dueDate) return NextResponse.json({ error: 'La fecha límite es requerida' }, { status: 400 })
    if (!companyId) return NextResponse.json({ error: 'La empresa es requerida' }, { status: 400 })

    const start = startDate ? new Date(startDate) : new Date()
    const due = new Date(dueDate)
    if (isNaN(start.getTime())) return NextResponse.json({ error: 'Fecha de inicio inválida' }, { status: 400 })
    if (isNaN(due.getTime())) return NextResponse.json({ error: 'Fecha límite inválida' }, { status: 400 })
    if (start > due) return NextResponse.json({ error: 'La fecha de inicio debe ser anterior o igual a la fecha límite' }, { status: 400 })

    const emails = (employeeEmails as string[]).map((e: string) => e.trim()).filter(Boolean)
    const invalidEmails = emails.filter((e) => !isValidEmail(e))
    if (invalidEmails.length > 0) {
      return NextResponse.json({ error: `Emails inválidos: ${invalidEmails.join(', ')}` }, { status: 400 })
    }

    const company = await prisma.company.findFirst({ where: { id: companyId, userId: session.user.id } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const task = await prisma.corporateTask.create({
      data: {
        title: title.trim(),
        description: description?.trim() ?? '',
        priority,
        startDate: start,
        dueDate: due,
        companyId,
        employeeEmails: emails,
        attachmentUrl: attachmentUrl?.trim() || null,
        internalNotes: internalNotes?.trim() || null,
        isRecurring,
        recurringRule: isRecurring ? recurringRule : null,
        recurringEndDate: isRecurring && recurringEndDate ? new Date(recurringEndDate) : null,
      },
    })

    // Generar una instancia por cada día desde startDate hasta dueDate
    let instanceDates: Date[]
    if (!isRecurring) {
      instanceDates = generateDailyInstancesForTask(start, due)
    } else if (recurringRule && recurringEndDate) {
      instanceDates = generateRecurringInstances(start, due, recurringRule as RecurringRule, new Date(recurringEndDate))
    } else {
      instanceDates = generateDailyInstancesForTask(start, due)
    }

    if (instanceDates.length > 0) {
      await prisma.taskInstance.createMany({
        data: instanceDates.map((date) => ({ corporateTaskId: task.id, scheduledDate: date })),
        skipDuplicates: true,
      })
    }

    console.log(`[corporate-tasks] Tarea creada: "${task.title}" (${task.id}) — inicio: ${start.toISOString().slice(0,10)}, vence: ${due.toISOString().slice(0,10)}, ${instanceDates.length} instancias`)
    return NextResponse.json({ id: task.id, status: task.status, createdAt: task.createdAt }, { status: 201 })
  } catch (err) {
    console.error('[corporate-tasks POST]', err)
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 })
  }
}
