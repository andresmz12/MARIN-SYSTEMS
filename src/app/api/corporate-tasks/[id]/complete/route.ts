import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await prisma.corporateTask.findFirst({
    where: { id: params.id, company: { userId: session.user.id } },
  })
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  try {
    const url = new URL(req.url)
    const taskInstanceId = url.searchParams.get('taskInstanceId')

    if (taskInstanceId) {
      await prisma.taskInstance.update({
        where: { id: taskInstanceId },
        data: { status: 'completed' },
      })
    } else {
      await prisma.corporateTask.update({
        where: { id: params.id },
        data: { status: 'completed', completedAt: new Date() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[complete]', err)
    return NextResponse.json({ error: 'Error al completar tarea' }, { status: 500 })
  }
}
