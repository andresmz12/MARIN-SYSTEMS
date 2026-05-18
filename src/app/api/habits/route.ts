import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { HabitSchema } from '@/lib/schemas'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const habits = await prisma.habit.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(habits)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener hábitos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = HabitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { name, emoji, category, frequency, isPreMarket } = parsed.data

    const habit = await prisma.habit.create({
      data: {
        userId: session.user.id,
        name,
        emoji,
        category,
        frequency,
        isPreMarket: isPreMarket ?? false,
      },
    })

    return NextResponse.json(habit, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear hábito' }, { status: 500 })
  }
}
