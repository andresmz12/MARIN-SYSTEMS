import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const month = searchParams.get('month') // e.g. "2026-06"

  const where: Record<string, unknown> = {
    company: { userId: session.user.id },
  }

  if (companyId) where.companyId = companyId

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 0, 23, 59, 59)
    where.dueDate = { gte: from, lte: to }
  }

  try {
    const tasks = await prisma.corporateTask.findMany({
      where,
      include: { company: { select: { id: true, name: true, emoji: true, color: true } } },
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

    const invalidEmails = (employeeEmails as string[]).filter((e) => e.trim() && !isValidEmail(e))
    if (invalidEmails.length > 0) {
      return NextResponse.json({ error: `Emails inválidos: ${invalidEmails.join(', ')}` }, { status: 400 })
    }

    // Verify company belongs to user
    const company = await prisma.company.findFirst({ where: { id: companyId, userId: session.user.id } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const task = await prisma.corporateTask.create({
      data: {
        title: title.trim(),
        description: description?.trim() ?? '',
        priority,
        dueDate: due,
        companyId,
        employeeEmails: (employeeEmails as string[]).map((e: string) => e.trim()).filter(Boolean),
        attachmentUrl: attachmentUrl?.trim() || null,
        internalNotes: internalNotes?.trim() || null,
        isRecurring,
        recurringRule: isRecurring ? recurringRule : null,
        recurringEndDate: isRecurring && recurringEndDate ? new Date(recurringEndDate) : null,
      },
    })

    return NextResponse.json({ id: task.id, status: task.status, createdAt: task.createdAt }, { status: 201 })
  } catch (err) {
    console.error('[corporate-tasks POST]', err)
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 })
  }
}
