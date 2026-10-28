import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withCronLog } from '@/lib/cron-run'
import { AUTO_PLATFORMS } from '@/lib/platforms'
import { MAX_PUBLISH_ATTEMPTS, RETRY_AFTER_MS, STUCK_AFTER_MS, publishConfigured, publishPost } from '@/lib/publisher'

export const maxDuration = 120

// Un post aprobado con más retraso que esto ya no es oportuno: se deja para que el
// dueño decida (reprogramar, "publicar ahora" o subirlo a mano).
const STALE_AFTER_MS = 30 * 60 * 60 * 1000

// Publica los posts aprobados cuya hora ya llegó, enviándolos por webhook a un
// servicio intermedio (Make, Zapier, n8n, ...) que los sube a cada red.
// Sin PUBLISH_WEBHOOK_URL no hace nada: los posts quedan "aprobados" para subir a mano.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!publishConfigured()) return NextResponse.json({ skipped: 'PUBLISH_WEBHOOK_URL no configurado' })

  try {
    const now = Date.now()

    // Posts que quedaron "publishing" por una caída a mitad de envío: se liberan.
    const released = await prisma.generatedPost.updateMany({
      where: { status: 'publishing', lastAttemptAt: { lt: new Date(now - STUCK_AFTER_MS) } },
      data: { status: 'approved' },
    })

    const due = await prisma.generatedPost.findMany({
      where: {
        status: 'approved',
        imageUrl: { not: null },
        platform: { in: [...AUTO_PLATFORMS] },
        scheduledDate: { lte: new Date(now), gte: new Date(now - STALE_AFTER_MS) },
        publishAttempts: { lt: MAX_PUBLISH_ATTEMPTS },
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now - RETRY_AFTER_MS) } }],
      },
      orderBy: { scheduledDate: 'asc' },
      take: 20,
      select: { id: true, platform: true },
    })

    const results: { id: string; platform: string; ok: boolean; error?: string; final?: boolean }[] = []
    for (const post of due) {
      const r = await publishPost(post.id)
      results.push({ id: post.id, platform: post.platform, ...r })
    }

    const exhausted = results.filter((r) => r.final)
    console.log('[cron/publish-due]', JSON.stringify({ released: released.count, results }))
    // Si algún post agotó sus intentos, la corrida se marca como fallida: queda en la
    // bitácora y avisa por correo.
    if (exhausted.length > 0) {
      return NextResponse.json(
        { error: `${exhausted.length} post(s) no se pudieron publicar tras ${MAX_PUBLISH_ATTEMPTS} intentos: ${exhausted.map((r) => `${r.platform} (${r.error})`).join('; ')}`, due: due.length, results },
        { status: 500 },
      )
    }
    return NextResponse.json({ due: due.length, released: released.count, results })
  } catch (err) {
    console.error('[cron/publish-due]', err)
    return NextResponse.json({ error: 'Error publicando contenido' }, { status: 500 })
  }
}

export const POST = withCronLog('publish-due', handler)
