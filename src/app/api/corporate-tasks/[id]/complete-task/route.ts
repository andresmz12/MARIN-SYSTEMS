import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.corporateTask.findFirst({
    where: { id: params.id, company: { userId: session.user.id } },
  })
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  if (task.status === 'completed') return NextResponse.json({ error: 'La tarea ya está completada' }, { status: 400 })

  await prisma.corporateTask.update({
    where: { id: params.id },
    data: { status: 'completed', completedAt: new Date() },
  })

  // Mark all pending instances as completed too
  await prisma.taskInstance.updateMany({
    where: { corporateTaskId: params.id, status: 'pending' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { status: 'completed', completedAt: new Date() } as any,
  })

  return NextResponse.json({ id: params.id, completed: true })
}
