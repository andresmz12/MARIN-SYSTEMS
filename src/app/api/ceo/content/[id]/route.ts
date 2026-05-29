import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  status: z.enum(['draft', 'ready', 'published']).optional(),
  copy: z.string().min(1).optional(),
  scheduledDate: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existing = await prisma.generatedPost.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!existing) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    const { status, copy, scheduledDate, publishedAt } = parsed.data
    const post = await prisma.generatedPost.update({
      where: { id: params.id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(copy !== undefined ? { copy } : {}),
        ...(scheduledDate !== undefined ? { scheduledDate: scheduledDate ? new Date(scheduledDate) : null } : {}),
        ...(publishedAt !== undefined ? { publishedAt: publishedAt ? new Date(publishedAt) : null } : {}),
        ...(status === 'published' ? { publishedAt: new Date() } : {}),
      },
      include: { company: true },
    })

    return NextResponse.json(post)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al actualizar el contenido' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await prisma.generatedPost.deleteMany({
      where: { id: params.id, userId: session.user.id },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al eliminar el contenido' }, { status: 500 })
  }
}
