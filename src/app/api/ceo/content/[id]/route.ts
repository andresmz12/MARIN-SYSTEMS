import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'ready', 'published']).optional(),
  reviewNote: z.string().max(500).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  imagePrompt: z.string().max(1000).optional(),
  imageText: z.object({
    headline: z.string().trim().min(1).max(140),
    subheadline: z.string().trim().max(240).optional(),
    bullets: z.array(z.string().trim().min(1).max(100)).max(3).optional(),
  }).optional(),
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

    const { status, copy, scheduledDate, publishedAt, reviewNote, imageUrl, imagePrompt, imageText } = parsed.data
    // Lo que se decide sobre el contenido (aprobar, rechazar, editar, reprogramar) vale para todas
    // las redes del grupo; marcar publicado y la imagen son de cada post.
    const shared = {
      ...(status !== undefined && status !== 'published' ? { status } : {}),
      ...(copy !== undefined ? { copy } : {}),
      ...(reviewNote !== undefined ? { reviewNote } : {}),
      ...(imagePrompt !== undefined ? { imagePrompt } : {}),
      ...(imageText !== undefined ? { imageText } : {}),
      ...(scheduledDate !== undefined ? { scheduledDate: scheduledDate ? new Date(scheduledDate) : null } : {}),
    }
    const own = {
      ...(status === 'published' ? { status, publishedAt: new Date() } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(publishedAt !== undefined && status !== 'published' ? { publishedAt: publishedAt ? new Date(publishedAt) : null } : {}),
    }
    if (existing.groupId && Object.keys(shared).length > 0) {
      await prisma.generatedPost.updateMany({
        where: {
          groupId: existing.groupId,
          userId: session.user.id,
          id: { not: existing.id },
          // Lo ya publicado o en envío no se toca.
          status: { notIn: ['published', 'publishing'] },
        },
        data: shared,
      })
    }
    const post = await prisma.generatedPost.update({
      where: { id: params.id },
      data: { ...shared, ...own },
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
