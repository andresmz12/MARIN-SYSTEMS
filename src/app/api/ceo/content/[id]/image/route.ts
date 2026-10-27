import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import sharp from 'sharp'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

function publicUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app').replace(/\/$/, '')
  return `${base}/api/public/post-image/${token}`
}

// Sube la imagen del post. Se convierte siempre a JPEG (Instagram solo acepta JPEG;
// ChatGPT entrega PNG/WebP) y se limita a 2048px de lado mayor.
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

    const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer()

    const image = await prisma.postImage.upsert({
      where: { postId: post.id },
      update: { data: jpeg, mime: 'image/jpeg' },
      create: { postId: post.id, data: jpeg, mime: 'image/jpeg' },
    })

    const updated = await prisma.generatedPost.update({
      where: { id: post.id },
      data: { imageUrl: publicUrl(image.token) },
      include: { company: true },
    })
    return NextResponse.json(updated)
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

    await prisma.postImage.deleteMany({ where: { postId: post.id } })
    const updated = await prisma.generatedPost.update({
      where: { id: post.id },
      data: { imageUrl: null },
      include: { company: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'No se pudo quitar la imagen' }, { status: 500 })
  }
}
