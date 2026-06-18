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
      // Mark this specific instance as completed
      const instance = await prisma.taskInstance.update({
        where: { id: taskInstanceId },
        data: { status: 'completed' },
      })

      // Also complete all future pending instances of the same task
      const { count } = await prisma.taskInstance.updateMany({
        where: {
          corporateTaskId: instance.corporateTaskId,
          scheduledDate: { gt: instance.scheduledDate },
          status: 'pending',
        },
        data: { status: 'completed' },
      })

      console.log(`[complete] Instancia ${taskInstanceId} completada — ${count} instancias futuras también completadas`)
      return NextResponse.json({ success: true, futureCompleted: count })
    } else {
      // Complete the task itself and all its pending instances
      await prisma.corporateTask.update({
        where: { id: params.id },
        data: { status: 'completed', completedAt: new Date() },
      })
      const { count } = await prisma.taskInstance.updateMany({
        where: { corporateTaskId: params.id, status: 'pending' },
        data: { status: 'completed' },
      })

      console.log(`[complete] Tarea ${params.id} completada — ${count} instancias pendientes completadas`)
      return NextResponse.json({ success: true, instancesCompleted: count })
    }
  } catch (err) {
    console.error('[complete]', err)
    return NextResponse.json({ error: 'Error al completar tarea' }, { status: 500 })
  }
}
