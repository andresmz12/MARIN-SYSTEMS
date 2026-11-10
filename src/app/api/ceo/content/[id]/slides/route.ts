import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import sharp from 'sharp'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GROUP_IMAGE_PLATFORM, IMAGE_SPECS, MAX_CROP_LOSS, MAX_SLIDES } from '@/lib/image-prompt'
import { fitToSpec } from '@/lib/image-fit'

export const maxDuration = 120

const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

function base(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app').replace(/\/$/, '')
}

// Sube TODAS las láminas del carrusel de una vez (en el orden del nombre de archivo: 1, 2, 3…).
// Todas se llevan al mismo tamaño 4:5 de Instagram, porque Instagram recorta todas a la proporción de la primera.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    const form = await req.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File)
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (files.length < 2) return NextResponse.json({ error: 'Un carrusel necesita al menos 2 imágenes' }, { status: 400 })
    if (files.length > MAX_SLIDES) return NextResponse.json({ error: `Instagram permite máximo ${MAX_SLIDES} láminas` }, { status: 400 })

    // Se leen todas las láminas. El formato del carrusel lo marca la PRIMERA (Instagram recorta todas a su proporción):
    // vertical 4:5 (1080×1350) o, si viene de Gemini / Google Presentaciones, horizontal 16:9 (1080×608).
    // Instagram acepta carruseles entre 1,91:1 y 4:5, así que el 16:9 se publica entero, sin cortar nada.
    const loaded: { data: Buffer; width: number; height: number }[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: `La lámina ${i + 1} (${file.name}) no es PNG, JPG o WebP` }, { status: 400 })
      if (file.size > MAX_BYTES) return NextResponse.json({ error: `La lámina ${i + 1} (${file.name}) pesa más de 8 MB` }, { status: 400 })
      const img = await sharp(Buffer.from(await file.arrayBuffer())).rotate().toBuffer({ resolveWithObject: true })
      loaded.push({ data: img.data, width: img.info.width, height: img.info.height })
    }
    const landscape = loaded[0].width / loaded[0].height >= 1.4
    const spec = landscape ? { width: 1080, height: 608 } : IMAGE_SPECS[GROUP_IMAGE_PLATFORM]
    const target = spec.width / spec.height
    const buffers: Buffer[] = []
    const wholeFit: number[] = [] // láminas con otra proporción: se colocaron enteras con fondo difuminado
    for (let i = 0; i < loaded.length; i++) {
      const { data, width, height } = loaded[i]
      const ratio = width / height
      const loss = ratio > target ? 1 - target / ratio : 1 - ratio / target
      if (Math.abs(ratio - target) / target > 0.02 && loss > MAX_CROP_LOSS) {
        // No se corta (perdería contenido): va entera en el centro y se rellena con la misma imagen difuminada.
        buffers.push((await fitToSpec(data, spec, loss, 'complete')).data)
        wholeFit.push(i + 1)
        continue
      }
      buffers.push(
        await sharp(data)
          .resize({ width: spec.width, height: spec.height, fit: 'cover', position: 'centre' })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 90 })
          .toBuffer(),
      )
    }

    // Todas las redes del grupo comparten el carrusel (cada post guarda su copia y sus enlaces).
    const targets = post.groupId
      ? await prisma.generatedPost.findMany({ where: { groupId: post.groupId, userId: session.user.id, status: { notIn: ['published', 'publishing'] } }, select: { id: true } })
      : [{ id: post.id }]
    if (!targets.some((t) => t.id === post.id)) targets.push({ id: post.id })

    let updated = null
    for (const t of targets) {
      await prisma.postSlideImage.deleteMany({ where: { postId: t.id } })
      const cover = await prisma.postImage.upsert({
        where: { postId: t.id },
        update: { data: buffers[0], mime: 'image/jpeg' },
        create: { postId: t.id, data: buffers[0], mime: 'image/jpeg' },
      })
      const urls = [`${base()}/api/public/post-image/${cover.token}`]
      for (let i = 1; i < buffers.length; i++) {
        const s = await prisma.postSlideImage.create({ data: { postId: t.id, position: i, data: buffers[i], mime: 'image/jpeg' } })
        urls.push(`${base()}/api/public/slide-image/${s.token}`)
      }
      const row = await prisma.generatedPost.update({
        where: { id: t.id },
        data: { imageUrl: urls[0], slideImageUrls: urls, imageWidth: spec.width, imageHeight: spec.height },
        include: { company: true },
      })
      if (t.id === post.id) updated = row
    }
    const parts: string[] = []
    if (landscape) parts.push('Carrusel horizontal 16:9 (como lo hacen Gemini y Google Presentaciones): Instagram lo muestra entero, un poco más bajo que uno vertical.')
    if (wholeFit.length) parts.push(`${wholeFit.length > 1 ? 'Las láminas' : 'La lámina'} ${wholeFit.join(', ')} ${wholeFit.length > 1 ? 'tenían otra proporción' : 'tenía otra proporción'}: se ${wholeFit.length > 1 ? 'colocaron enteras' : 'colocó entera'} con fondo difuminado, sin cortar nada.`)
    const notice = parts.join(' ')
    return NextResponse.json(updated, notice ? { headers: { 'X-Slides-Notice': encodeURIComponent(notice) } } : undefined)
  } catch (err) {
    console.error('[slides]', err)
    return NextResponse.json({ error: 'No se pudieron procesar las láminas' }, { status: 500 })
  }
}

// Quita las láminas (y la portada): el post vuelve a no tener imagen.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
    const ids = post.groupId
      ? (await prisma.generatedPost.findMany({ where: { groupId: post.groupId, userId: session.user.id, status: { notIn: ['published', 'publishing'] } }, select: { id: true } })).map((r) => r.id)
      : []
    if (!ids.includes(post.id)) ids.push(post.id)
    await prisma.postSlideImage.deleteMany({ where: { postId: { in: ids } } })
    await prisma.postImage.deleteMany({ where: { postId: { in: ids } } })
    await prisma.generatedPost.updateMany({ where: { id: { in: ids } }, data: { imageUrl: null, imageWidth: null, imageHeight: null, slideImageUrls: [] } })
    const updated = await prisma.generatedPost.findUnique({ where: { id: post.id }, include: { company: true } })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[slides]', err)
    return NextResponse.json({ error: 'No se pudieron quitar las láminas' }, { status: 500 })
  }
}
