import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import sharp from 'sharp'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GROUP_IMAGE_PLATFORM, IMAGE_SPECS, MAX_SLIDES, planFit } from '@/lib/image-prompt'
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

    const spec = IMAGE_SPECS[GROUP_IMAGE_PLATFORM]
    const buffers: Buffer[] = []
    const wholeFit: number[] = [] // láminas que no eran verticales: se colocaron enteras con fondo difuminado
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: `La lámina ${i + 1} (${file.name}) no es PNG, JPG o WebP` }, { status: 400 })
      if (file.size > MAX_BYTES) return NextResponse.json({ error: `La lámina ${i + 1} (${file.name}) pesa más de 8 MB` }, { status: 400 })
      const img = await sharp(Buffer.from(await file.arrayBuffer())).rotate().toBuffer({ resolveWithObject: true })
      const plan = planFit(GROUP_IMAGE_PLATFORM, img.info.width, img.info.height)
      if (plan.action === 'mismatch') {
        // Una lámina horizontal (por ejemplo una presentación 16:9) no se corta: va entera en el centro y arriba y abajo
        // se rellenan con la misma imagen difuminada, igual que una imagen suelta.
        buffers.push((await fitToSpec(img.data, spec, plan.loss, 'complete')).data)
        wholeFit.push(i + 1)
        continue
      }
      buffers.push(
        await sharp(img.data)
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
    const notice = wholeFit.length
      ? `La${wholeFit.length > 1 ? 's láminas' : ' lámina'} ${wholeFit.join(', ')} no ${wholeFit.length > 1 ? 'eran verticales' : 'era vertical'} (4:5): se ${wholeFit.length > 1 ? 'colocaron enteras' : 'colocó entera'} con fondo difuminado, sin cortar nada. Para que se vea más grande, pide a Gemini páginas verticales 4:5 (1080×1350).`
      : ''
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
