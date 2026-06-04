import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MarketingIdeaUpdateSchema } from '@/lib/ceo'
import type { Prisma } from '@prisma/client'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = MarketingIdeaUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existing = await prisma.marketingIdea.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!existing) return NextResponse.json({ error: 'Idea no encontrada' }, { status: 404 })

    const { scheduledDate, status, ...rest } = parsed.data
    const data: Prisma.MarketingIdeaUpdateInput = { ...rest }

    if (status !== undefined) {
      data.status = status
      // Stamp completion time when an idea is marked done.
      data.doneAt = status === 'done' ? new Date() : null
    }
    if (scheduledDate !== undefined) {
      data.scheduledDate = scheduledDate ? new Date(scheduledDate) : null
    }

    const idea = await prisma.marketingIdea.update({
      where: { id: params.id },
      data,
      include: { company: true },
    })

    return NextResponse.json(idea)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al actualizar idea' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const existing = await prisma.marketingIdea.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!existing) return NextResponse.json({ error: 'Idea no encontrada' }, { status: 404 })

    await prisma.marketingIdea.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al eliminar idea' }, { status: 500 })
  }
}
