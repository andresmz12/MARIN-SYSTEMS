import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { done?: unknown } | null
  if (typeof body?.done !== 'boolean') return NextResponse.json({ error: 'Se requiere done: boolean' }, { status: 400 })

  const task = await prisma.meetingTask.findFirst({
    where: { id: params.taskId, meetingId: params.id, meeting: { userId: session.user.id } },
  })
  if (!task) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const updated = await prisma.meetingTask.update({ where: { id: task.id }, data: { done: body.done } })
  return NextResponse.json(updated)
}
