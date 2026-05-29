import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DayStatusUpsertSchema, ROLLOVER_STATUSES, parseDateOnly, dateKey, nextWorkDay } from '@/lib/ceo'

const planInclude = {
  dailyPlan: {
    include: { workBlocks: { include: { company: true }, orderBy: { startTime: 'asc' as const } } },
  },
} as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date')
    if (!dateStr) return NextResponse.json({ error: 'Parámetro date requerido' }, { status: 400 })

    const date = parseDateOnly(dateStr)
    const dayStatus = await prisma.dayStatus.findUnique({
      where: { userId_date: { userId: session.user.id, date } },
      include: planInclude,
    })

    return NextResponse.json(dayStatus)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener estado del día' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = DayStatusUpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { date: dateStr, status, availableHours, note } = parsed.data
    const date = parseDateOnly(dateStr)
    const userId = session.user.id

    const dayStatus = await prisma.dayStatus.upsert({
      where: { userId_date: { userId, date } },
      update: {
        ...(status !== undefined ? { status } : {}),
        ...(availableHours !== undefined ? { availableHours } : {}),
        ...(note !== undefined ? { note } : {}),
      },
      create: {
        userId,
        date,
        status: status ?? 'normal',
        availableHours: availableHours ?? 8,
        note: note ?? null,
      },
      include: planInclude,
    })

    // Rollover flow: when the day is sick / off / travel, push pending blocks forward.
    if (status && ROLLOVER_STATUSES.includes(status)) {
      const plan = dayStatus.dailyPlan
      if (plan) {
        const next = nextWorkDay(date)
        // Fixed routine blocks never roll over.
        const pendingBlocks = plan.workBlocks.filter((b) => b.status === 'pending' && !b.isFixed)

        if (pendingBlocks.length > 0) {
          await prisma.workBlock.updateMany({
            where: { dailyPlanId: plan.id, status: 'pending', isFixed: false },
            data: { status: 'rolled_over', rolledToDate: next },
          })
          await prisma.dailyPlan.update({
            where: { id: plan.id },
            data: { status: 'rolled_over' },
          })
        }

        const refreshed = await prisma.dayStatus.findUnique({
          where: { userId_date: { userId, date } },
          include: planInclude,
        })

        return NextResponse.json({
          dayStatus: refreshed,
          rolledBlocks: pendingBlocks.length,
          nextWorkDay: dateKey(next),
        })
      }

      return NextResponse.json({ dayStatus, rolledBlocks: 0, nextWorkDay: dateKey(nextWorkDay(date)) })
    }

    return NextResponse.json({ dayStatus, rolledBlocks: 0, nextWorkDay: null })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al guardar estado del día' }, { status: 500 })
  }
}
