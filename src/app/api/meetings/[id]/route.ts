import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function assertOwnership(userId: string, id: string) {
  const meeting = await prisma.meeting.findUnique({ where: { id }, select: { userId: true } })
  return meeting?.userId === userId
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meeting = await prisma.meeting.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      company: { select: { id: true, name: true, color: true, emoji: true } },
      tasks: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!meeting) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(meeting)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertOwnership(session.user.id, params.id))) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  const body = await req.json().catch(() => null) as {
    title?: unknown; companyId?: unknown; strokes?: unknown; summary?: unknown
  } | null
  if (!body) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (body.companyId === null || typeof body.companyId === 'string') data.companyId = body.companyId || null
  if (Array.isArray(body.strokes)) data.strokes = body.strokes
  if (typeof body.summary === 'string') data.summary = body.summary

  const meeting = await prisma.meeting.update({ where: { id: params.id }, data })
  return NextResponse.json(meeting)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await assertOwnership(session.user.id, params.id))) {
    return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  }

  await prisma.meeting.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
