import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Vuelve a la versión del texto que había antes de regenerar. Si se vuelve, lo de ahora queda como "anterior"
// (así el botón sirve también para rehacer).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
  if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
  if (post.status === 'published') return NextResponse.json({ error: 'Un post publicado no se puede cambiar' }, { status: 400 })
  const prev = post.previousVersion as null | {
    copy: string; hashtags: string[]; cta: string; contentNotes: string | null; imagePrompt: string | null
    imageText: unknown; facts: string[]; topic: string
  }
  if (!prev || typeof prev.copy !== 'string') return NextResponse.json({ error: 'No hay una versión anterior guardada' }, { status: 404 })

  const current = {
    copy: post.copy, hashtags: post.hashtags, cta: post.cta, contentNotes: post.contentNotes, imagePrompt: post.imagePrompt,
    imageText: post.imageText ?? null, facts: post.facts, topic: post.topic, savedAt: new Date().toISOString(),
  }
  const data = {
    previousVersion: current as never,
    copy: prev.copy,
    hashtags: prev.hashtags ?? [],
    cta: prev.cta ?? '',
    contentNotes: prev.contentNotes ?? null,
    imagePrompt: prev.imagePrompt ?? null,
    imageText: (prev.imageText ?? Prisma.DbNull) as never,
    facts: prev.facts ?? [],
    topic: prev.topic ?? post.topic,
    factCheck: Prisma.DbNull,
    factCheckedAt: null,
  }
  if (post.groupId) {
    await prisma.generatedPost.updateMany({
      where: { groupId: post.groupId, userId: session.user.id, id: { not: post.id }, status: { notIn: ['published', 'publishing'] } },
      data,
    })
  }
  const updated = await prisma.generatedPost.update({ where: { id: post.id }, data, include: { company: true } })
  return NextResponse.json(updated)
}
