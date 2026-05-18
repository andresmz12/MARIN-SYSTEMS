import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TaskSchema } from '@/lib/schemas'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const tasks = await prisma.companyTask.findMany({
      where: { companyId: params.id, userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(tasks)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener tareas' }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = TaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { title, description, priority, status, dueDate } = parsed.data

    const task = await prisma.companyTask.create({
      data: {
        companyId: params.id,
        userId: session.user.id,
        title,
        description: description ?? null,
        priority: priority ?? 'media',
        status: status ?? 'pendiente',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 })
  }
}
