import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import sharp from 'sharp'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { IMAGE_SPECS, imagePlatformOf, planFit } from '@/lib/image-prompt'
import { fitToSpec, type FitMode } from '@/lib/image-fit'

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
    const specPlatform = imagePlatformOf(post)
    const plan = planFit(specPlatform, from.width, from.height)
    const spec = IMAGE_SPECS[specPlatform]
    const mode: FitMode = form.get('mode') === 'crop' ? 'crop' : 'complete'
    let jpeg: Buffer
    let info: { width: number; height: number }
    let action: string = plan.action
    if (plan.action === 'crop' && spec) {
      const fitted = await fitToSpec(base.data, spec, plan.loss, mode)
      jpeg = fitted.data
      info = { width: spec.width, height: spec.height }
      action = fitted.action
    } else {
      const out = await sharp(base.data)
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toBuffer({ resolveWithObject: true })
      jpeg = out.data
      info = { width: out.info.width, height: out.info.height }
    }

    // La misma imagen para todas las redes del grupo (cada post guarda su copia y su enlace público).
    const targets = post.groupId
      ? await prisma.generatedPost.findMany({
          where: { groupId: post.groupId, userId: session.user.id, status: { notIn: ['published', 'publishing'] } },
          select: { id: true },
        })
      : [{ id: post.id }]
    if (!targets.some((t) => t.id === post.id)) targets.push({ id: post.id })
    let updated = null
    for (const t of targets) {
      await prisma.postSlideImage.deleteMany({ where: { postId: t.id } })
      const image = await prisma.postImage.upsert({
        where: { postId: t.id },
        update: { data: jpeg, mime: 'image/jpeg' },
        create: { postId: t.id, data: jpeg, mime: 'image/jpeg' },
      })
      const row = await prisma.generatedPost.update({
        where: { id: t.id },
        data: { imageUrl: publicUrl(image.token), slideImageUrls: [], imageWidth: info.width, imageHeight: info.height },
        include: { company: true },
      })
      if (t.id === post.id) updated = row
    }
    return NextResponse.json({
      ...updated,
      fit: { platform: specPlatform, action, from, to: { width: info.width, height: info.height }, target: spec ? `${spec.width}x${spec.height} (${spec.ratio})` : null },
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
