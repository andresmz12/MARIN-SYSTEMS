import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDateOnly, dateKey } from '@/lib/ceo'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const startStr = searchParams.get('startDate')
    if (!startStr) return NextResponse.json({ error: 'Parámetro startDate requerido' }, { status: 400 })

    const start = parseDateOnly(startStr)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)

    const dayStatuses = await prisma.dayStatus.findMany({
      where: { userId: session.user.id, date: { gte: start, lt: end } },
      include: {
        dailyPlan: {
          include: { workBlocks: { include: { company: true }, orderBy: { startTime: 'asc' } } },
        },
      },
    })

    const byDate = new Map(dayStatuses.map((d) => [dateKey(d.date), d]))

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setUTCDate(d.getUTCDate() + i)
      const key = dateKey(d)
      const dayStatus = byDate.get(key) ?? null
      const plan = dayStatus?.dailyPlan ?? null
      // Progress reflects only dynamic company work — fixed routine blocks don't count.
      const blocks = (plan?.workBlocks ?? []).filter((b) => !b.isFixed)

      const totalHours = blocks.reduce((s, b) => s + b.durationHours, 0)
      const completedHours = blocks
        .filter((b) => b.status === 'done')
        .reduce((s, b) => s + b.durationHours, 0)
      const pendingBlocks = blocks.filter((b) => b.status === 'pending').length

      return {
        date: key,
        dayStatus,
        plan,
        totalHours,
        completedHours,
        pendingBlocks,
        totalBlocks: blocks.length,
        completedBlocks: blocks.filter((b) => b.status === 'done').length,
      }
    })

    return NextResponse.json(days)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener la semana' }, { status: 500 })
  }
}
