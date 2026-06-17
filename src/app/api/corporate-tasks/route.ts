import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateNextOccurrences, RecurringRule } from '@/lib/recurring-tasks'

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
    where.dueDate = { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) }
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
      title, description, priority = 'medium', dueDate, companyId,
      employeeEmails = [], attachmentUrl, internalNotes,
      isRecurring = false, recurringRule, recurringEndDate,
    } = body

    if (!title?.trim()) return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
    if (!dueDate) return NextResponse.json({ error: 'La fecha límite es requerida' }, { status: 400 })
    if (!companyId) return NextResponse.json({ error: 'La empresa es requerida' }, { status: 400 })

    const due = new Date(dueDate)
    if (isNaN(due.getTime())) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })

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

    // Generate recurring instances if applicable
    if (isRecurring && recurringRule && recurringEndDate) {
      const occurrences = generateNextOccurrences(due, recurringRule as RecurringRule, new Date(recurringEndDate), 30)
      if (occurrences.length > 0) {
        await prisma.taskInstance.createMany({
          data: occurrences.map((date) => ({ corporateTaskId: task.id, scheduledDate: date })),
          skipDuplicates: true,
        })
      }
    }

    console.log(`[corporate-tasks] Tarea creada: ${task.title} (${task.id})`)
    return NextResponse.json({ id: task.id, status: task.status, createdAt: task.createdAt }, { status: 201 })
  } catch (err) {
    console.error('[corporate-tasks POST]', err)
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 })
  }
}
