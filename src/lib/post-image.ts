import sharp from 'sharp'
import type { GeneratedPost } from '@prisma/client'
import { prisma } from './prisma'
import { IMAGE_SPECS, imagePlatformOf, planFit } from './image-prompt'
import { fitToSpec, type FitMode } from './image-fit'

function publicUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app').replace(/\/$/, '')
  return `${base}/api/public/post-image/${token}`
}

/**
 * Procesa la imagen de un post (la sube una persona o la genera la IA): la pasa a JPEG, la ajusta al tamaño de la red
 * y la guarda para TODAS las redes del mismo contenido (cada post guarda su copia y su enlace público).
 */
export async function storeGroupImage(post: GeneratedPost, userId: string, input: Buffer, mode: FitMode) {
  // 1) Normalizar orientación EXIF y leer el tamaño real.
  const base = await sharp(input).rotate().toBuffer({ resolveWithObject: true })
  const from = { width: base.info.width, height: base.info.height }

  // 2) Ajustar a la proporción de la red. Si habría que recortar demasiado (orientación equivocada), se deja tal cual.
  const specPlatform = imagePlatformOf(post)
  const plan = planFit(specPlatform, from.width, from.height)
  const spec = IMAGE_SPECS[specPlatform]
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

  const targets = post.groupId
    ? await prisma.generatedPost.findMany({
        where: { groupId: post.groupId, userId, status: { notIn: ['published', 'publishing'] } },
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
  return {
    ...updated,
    fit: { platform: specPlatform, action, from, to: { width: info.width, height: info.height }, target: spec ? `${spec.width}x${spec.height} (${spec.ratio})` : null },
  }
}
