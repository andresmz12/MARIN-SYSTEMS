import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const maxDuration = 120

const STALE_AFTER_MS = 30 * 60 * 60 * 1000

// Publica los posts aprobados cuya hora ya llegó, enviándolos por webhook a un
// servicio intermedio (Make, Zapier, n8n, ...) que los sube a cada red.
// Sin PUBLISH_WEBHOOK_URL no hace nada: los posts quedan "aprobados" para subir a mano.
export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.PUBLISH_WEBHOOK_URL
  if (!url) return NextResponse.json({ skipped: 'PUBLISH_WEBHOOK_URL no configurado' })

  try {
    // Ventana de 30 h: un post aprobado con más retraso ya no es oportuno y se deja
    // para que el dueño decida (reprogramar o subir a mano).
    const oldest = new Date(Date.now() - STALE_AFTER_MS)
    const due = await prisma.generatedPost.findMany({
      where: {
        status: 'approved',
        imageUrl: { not: null },
        scheduledDate: { lte: new Date(), gte: oldest },
        platform: { in: ['instagram', 'facebook', 'linkedin', 'tiktok'] },
      },
      include: { company: { select: { name: true } } },
      orderBy: { scheduledDate: 'asc' },
      take: 20,
    })

    const results: { id: string; platform: string; ok: boolean; error?: string }[] = []

    for (const post of due) {
      const hashtags = post.hashtags.join(' ')
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.PUBLISH_WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.PUBLISH_WEBHOOK_SECRET } : {}),
          },
          body: JSON.stringify({
            postId: post.id,
            company: post.company.name,
            platform: post.platform,
            copy: post.copy,
            hashtags: post.hashtags,
            cta: post.cta,
            text: hashtags ? `${post.copy}\n\n${hashtags}` : post.copy,
            imageUrl: post.imageUrl,
            scheduledDate: post.scheduledDate,
          }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) throw new Error(`Webhook respondió ${res.status}`)

        await prisma.generatedPost.update({
          where: { id: post.id },
          data: { status: 'published', publishedAt: new Date() },
        })
        results.push({ id: post.id, platform: post.platform, ok: true })
      } catch (err) {
        console.error(`[cron/publish-due] ${post.id}`, err)
        results.push({ id: post.id, platform: post.platform, ok: false, error: String(err) })
      }
    }

    console.log('[cron/publish-due]', JSON.stringify(results))
    return NextResponse.json({ due: due.length, results })
  } catch (err) {
    console.error('[cron/publish-due]', err)
    return NextResponse.json({ error: 'Error publicando contenido' }, { status: 500 })
  }
}
