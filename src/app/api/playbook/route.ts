import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const entries = await prisma.playbookEntry.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error('[GET /api/playbook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, conditions, entry, exit, notes } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
    }

    const entry_ = await prisma.playbookEntry.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        conditions: conditions ?? '',
        entry: entry ?? '',
        exit: exit ?? '',
        notes: notes ?? '',
      },
    })

    return NextResponse.json(entry_, { status: 201 })
  } catch (error) {
    console.error('[POST /api/playbook]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
