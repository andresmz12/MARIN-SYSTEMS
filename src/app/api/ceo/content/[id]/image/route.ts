import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import sharp from 'sharp'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { IMAGE_SPECS, planFit } from '@/lib/image-prompt'

export const maxDuration = 60

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

function publicUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app').replace(/\/$/, '')
  return `${base}/api/public/post-image/${token}`
}

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

    // 1) Normalizar orientación EXIF y leer el tamaño real.
    const base = await sharp(Buffer.from(await file.arrayBuffer())).rotate().toBuffer({ resolveWithObject: true })
    const from = { width: base.info.width, height: base.info.height }

    // 2) Ajustar a la proporción de la red: ChatGPT entrega 1:1, 2:3 o 3:2, así que se recorta
    //    al centro (el texto vive en la zona segura del prompt). Si habría que recortar demasiado
    //    (orientación equivocada), se deja tal cual y se avisa.
    const plan = planFit(post.platform, from.width, from.height)
    const spec = IMAGE_SPECS[post.platform]
    let pipeline = sharp(base.data)
    if (plan.action === 'crop' && spec) {
      pipeline = pipeline.resize({ width: spec.width, height: spec.height, fit: 'cover', position: 'centre' })
    } else {
      pipeline = pipeline.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    }
    const { data: jpeg, info } = await pipeline
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true })

    const image = await prisma.postImage.upsert({
      where: { postId: post.id },
      update: { data: jpeg, mime: 'image/jpeg' },
      create: { postId: post.id, data: jpeg, mime: 'image/jpeg' },
    })

    const updated = await prisma.generatedPost.update({
      where: { id: post.id },
      data: { imageUrl: publicUrl(image.token), imageWidth: info.width, imageHeight: info.height },
      include: { company: true },
    })
    return NextResponse.json({
      ...updated,
      fit: { action: plan.action, from, to: { width: info.width, height: info.height }, target: spec ? `${spec.width}x${spec.height} (${spec.ratio})` : null },
    })
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
      data: { imageUrl: null, imageWidth: null, imageHeight: null },
      include: { company: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'No se pudo quitar la imagen' }, { status: 500 })
  }
}
