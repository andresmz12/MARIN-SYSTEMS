import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// El servicio que publica (Make, n8n, agregador...) llama aquí al terminar para dar el
// resultado REAL: enlace del post publicado, o el error de la red. Se autentica con
// X-Webhook-Secret (= PUBLISH_WEBHOOK_SECRET) o con Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  const secret = process.env.PUBLISH_WEBHOOK_SECRET
  const cron = process.env.CRON_SECRET
  const okSecret = !!secret && req.headers.get('X-Webhook-Secret') === secret
  const okCron = !!cron && req.headers.get('Authorization') === `Bearer ${cron}`
  if (!okSecret && !okCron) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { postId?: unknown; ok?: unknown; url?: unknown; error?: unknown } | null
  const postId = typeof body?.postId === 'string' ? body.postId : ''
  if (!postId) return NextResponse.json({ error: 'Falta postId' }, { status: 400 })

  const post = await prisma.generatedPost.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) return NextResponse.json({ error: 'Post no encontrado' }, { status: 404 })

  const url = typeof body?.url === 'string' && /^https?:\/\//.test(body.url) ? body.url : null
  if (body?.ok === false) {
    const error = typeof body.error === 'string' && body.error ? body.error.slice(0, 500) : 'La red rechazó la publicación'
    await prisma.generatedPost.update({ where: { id: post.id }, data: { status: 'failed', publishError: error } })
    return NextResponse.json({ ok: true, status: 'failed' })
  }
  await prisma.generatedPost.update({
    where: { id: post.id },
    data: { status: 'published', publishedAt: new Date(), publishError: null, ...(url ? { externalUrl: url } : {}) },
  })
  return NextResponse.json({ ok: true, status: 'published' })
}
