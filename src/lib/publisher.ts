import { prisma } from '@/lib/prisma'
import { composePostText, publishablePlatforms } from '@/lib/platforms'

export const MAX_PUBLISH_ATTEMPTS = 3
/** Espera mínima entre intentos de un mismo post. */
export const RETRY_AFTER_MS = 30 * 60 * 1000
/** Un post "publishing" que lleva más de esto quedó colgado (caída a mitad de envío). */
export const STUCK_AFTER_MS = 15 * 60 * 1000

/**
 * Headers para el webhook de publicación. La clave viaja en `X-Webhook-Secret` (genérico) y
 * también en `x-make-apikey`, que es el header que usa la autenticación por API key nativa de
 * Make: así Make rechaza lo no autorizado ANTES de ejecutar el escenario (sin gastar créditos).
 */
export function webhookHeaders(): Record<string, string> {
  const secret = process.env.PUBLISH_WEBHOOK_SECRET
  return {
    'Content-Type': 'application/json',
    ...(secret ? { 'X-Webhook-Secret': secret, 'x-make-apikey': secret } : {}),
  }
}

export function publishConfigured(): boolean {
  return !!process.env.PUBLISH_WEBHOOK_URL
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app').replace(/\/$/, '')
}

export interface PublishResult {
  ok: boolean
  error?: string
  /** true si este fallo agotó los intentos y el post quedó en "failed". */
  final?: boolean
}

/**
 * Envía UN post aprobado al webhook de publicación (Make/Zapier/n8n/agregador).
 * El post se "reclama" de forma atómica (approved|failed → publishing) para que dos
 * ejecuciones simultáneas (cron + botón) no lo publiquen dos veces.
 */
export async function publishPost(postId: string, opts: { userId?: string } = {}): Promise<PublishResult> {
  const url = process.env.PUBLISH_WEBHOOK_URL
  if (!url) return { ok: false, error: 'PUBLISH_WEBHOOK_URL no configurado' }

  const post = await prisma.generatedPost.findFirst({
    where: { id: postId, ...(opts.userId ? { userId: opts.userId } : {}) },
    include: { company: { select: { name: true } } },
  })
  if (!post) return { ok: false, error: 'Post no encontrado' }
  if (post.status === 'published') return { ok: false, error: 'Ya está publicado' }
  if (!publishablePlatforms().includes(post.platform)) return { ok: false, error: `${post.platform} no se publica automáticamente: súbelo a mano` }
  if (!post.imageUrl) return { ok: false, error: 'El post no tiene imagen' }

  const claimed = await prisma.generatedPost.updateMany({
    where: { id: post.id, status: { in: ['approved', 'failed'] } },
    data: { status: 'publishing', lastAttemptAt: new Date() },
  })
  if (claimed.count === 0) return { ok: false, error: 'Ese post ya se está publicando o ya se publicó' }

  const attempts = post.publishAttempts + 1
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: webhookHeaders(),
      body: JSON.stringify({
        postId: post.id,
        idempotencyKey: post.id,
        company: post.company.name,
        platform: post.platform,
        // Texto ya listo para publicar (X: recortado a 280). `copy`/`hashtags`/`cta` por si el escenario los arma distinto.
        text: composePostText(post.platform, post.copy, post.hashtags),
        copy: post.copy,
        hashtags: post.hashtags,
        cta: post.cta,
        imageUrl: post.imageUrl,
        // Carrusel: todas las láminas en orden (la primera es la portada = imageUrl). Si no hay, solo la imagen del post.
        imageUrls: post.slideImageUrls.length > 1 ? post.slideImageUrls : [post.imageUrl],
        isCarousel: post.slideImageUrls.length > 1,
        scheduledDate: post.scheduledDate,
        // Si el escenario puede avisar el resultado real, que llame aquí al terminar.
        callbackUrl: `${appUrl()}/api/publish/callback`,
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) throw new Error(`El webhook respondió ${res.status}`)

    // Si el servicio devuelve el enlace del post publicado, se guarda.
    let externalUrl: string | null = null
    try {
      const body = (await res.json()) as { url?: unknown; permalink?: unknown }
      const candidate = body.url ?? body.permalink
      if (typeof candidate === 'string' && /^https?:\/\//.test(candidate)) externalUrl = candidate
    } catch { /* respuesta no JSON: es normal */ }

    await prisma.generatedPost.update({
      where: { id: post.id },
      data: { status: 'published', publishedAt: new Date(), publishAttempts: attempts, publishError: null, ...(externalUrl ? { externalUrl } : {}) },
    })
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const final = attempts >= MAX_PUBLISH_ATTEMPTS
    await prisma.generatedPost.update({
      where: { id: post.id },
      data: { status: final ? 'failed' : 'approved', publishAttempts: attempts, publishError: msg.slice(0, 500) },
    })
    return { ok: false, error: msg, final }
  }
}
