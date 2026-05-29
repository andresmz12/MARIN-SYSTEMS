import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { WorkBlockUpdateSchema, nextWorkDay } from '@/lib/ceo'
import type { Prisma } from '@prisma/client'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = WorkBlockUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existing = await prisma.workBlock.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: { dailyPlan: { select: { date: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'Bloque no encontrado' }, { status: 404 })

    const { status, description, startTime, endTime } = parsed.data
    const data: Prisma.WorkBlockUpdateInput = {}

    if (description !== undefined) data.description = description
    if (startTime !== undefined) data.startTime = startTime
    if (endTime !== undefined) data.endTime = endTime

    if (status !== undefined) {
      data.status = status
      if (status === 'rolled_over') {
        data.rolledToDate = nextWorkDay(existing.dailyPlan.date)
      }
    }

    const block = await prisma.workBlock.update({
      where: { id: params.id },
      data,
      include: { company: true },
    })

    return NextResponse.json(block)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al actualizar bloque' }, { status: 500 })
  }
}
