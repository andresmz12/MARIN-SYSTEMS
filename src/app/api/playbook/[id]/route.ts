import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await prisma.playbookEntry.findFirst({
      where: { id: params.id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const { name, conditions, entry, exit, notes } = body

    const updated = await prisma.playbookEntry.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(conditions !== undefined && { conditions }),
        ...(entry !== undefined && { entry }),
        ...(exit !== undefined && { exit }),
        ...(notes !== undefined && { notes }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[PUT /api/playbook/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const existing = await prisma.playbookEntry.findFirst({
      where: { id: params.id, userId: session.user.id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })
    }

    await prisma.playbookEntry.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DELETE /api/playbook/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
