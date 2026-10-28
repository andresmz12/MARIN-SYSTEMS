import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const num = z.number().int().min(0).max(1_000_000_000).nullable().optional()
const Schema = z.object({ reach: num, impressions: num, likes: num, comments: num, shares: num, saves: num, clicks: num })

// El dueño escribe a mano los números de un post publicado (para redes sin conexión automática).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const parsed = Schema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id }, select: { id: true } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    const metric = await prisma.postMetric.upsert({
      where: { postId: post.id },
      update: { ...parsed.data, source: 'manual' },
      create: { postId: post.id, ...parsed.data, source: 'manual' },
    })
    return NextResponse.json(metric)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al guardar las métricas' }, { status: 500 })
  }
}
