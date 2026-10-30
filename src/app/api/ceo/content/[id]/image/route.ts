import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { FitMode } from '@/lib/image-fit'
import { storeGroupImage } from '@/lib/post-image'

export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

// Sube la imagen del post. Se convierte siempre a JPEG (Instagram solo acepta JPEG; ChatGPT
// entrega PNG/WebP) y se ajusta al tamaño exacto de la red cuando basta un recorte al centro.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: 'Usa PNG, JPG o WebP' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen debe pesar menos de 8 MB' }, { status: 400 })

    const mode: FitMode = form.get('mode') === 'crop' ? 'crop' : 'complete'
    return NextResponse.json(await storeGroupImage(post, session.user.id, Buffer.from(await file.arrayBuffer()), mode))
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'No se pudo procesar la imagen' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    const ids = post.groupId
      ? (await prisma.generatedPost.findMany({
          where: { groupId: post.groupId, userId: session.user.id, status: { notIn: ['published', 'publishing'] } },
          select: { id: true },
        })).map((r) => r.id)
      : []
    if (!ids.includes(post.id)) ids.push(post.id)
    await prisma.postImage.deleteMany({ where: { postId: { in: ids } } })
    await prisma.postSlideImage.deleteMany({ where: { postId: { in: ids } } })
    await prisma.generatedPost.updateMany({
      where: { id: { in: ids } },
      data: { imageUrl: null, imageWidth: null, imageHeight: null, slideImageUrls: [] },
    })
    const updated = await prisma.generatedPost.findUnique({ where: { id: post.id }, include: { company: true } })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'No se pudo quitar la imagen' }, { status: 500 })
  }
}
