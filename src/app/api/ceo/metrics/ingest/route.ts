import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { composePostText } from '@/lib/platforms'

const num = z.coerce.number().int().min(0).max(1_000_000_000).optional()
const Item = z.object({
  platform: z.string().min(1).max(20),
  // Cómo reconocer el post: el id de nuestra base (si Make lo guardó), el id/URL de la red, o el texto publicado.
  postId: z.string().optional(),
  externalId: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
  message: z.string().max(5000).optional(),
  reach: num, impressions: num, likes: num, comments: num, shares: num, saves: num, clicks: num,
})
const Body = z.object({ items: z.array(Item).min(1).max(100) })

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60)

// Make (o cualquier herramienta) envía los números de los posts ya publicados.
// Autenticación: Authorization: Bearer <CRON_SECRET>, como los demás trabajos programados.
export async function POST(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })

  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const published = await prisma.generatedPost.findMany({
      where: { status: 'published', publishedAt: { gte: since } },
      select: { id: true, platform: true, copy: true, hashtags: true, externalUrl: true },
    })

    let matched = 0
    const unmatched: string[] = []
    for (const it of parsed.data.items) {
      const { platform, postId, externalId, url, message, ...m } = it
      const candidates = published.filter((p) => p.platform === platform)
      const post =
        (postId ? candidates.find((p) => p.id === postId) : undefined) ??
        (externalId || url
          ? candidates.find((p) => p.externalUrl && ((externalId && p.externalUrl.includes(externalId)) || (url && p.externalUrl === url)))
          : undefined) ??
        (message ? candidates.find((p) => norm(composePostText(p.platform, p.copy, p.hashtags)) === norm(message) || norm(p.copy) === norm(message)) : undefined)
      if (!post) { unmatched.push(externalId ?? url ?? (message ?? '').slice(0, 40)); continue }
      await prisma.postMetric.upsert({
        where: { postId: post.id },
        update: { ...m, source: 'make' },
        create: { postId: post.id, ...m, source: 'make' },
      })
      matched++
    }
    return NextResponse.json({ matched, unmatched })
  } catch (err) {
    console.error('[metrics/ingest]', err)
    return NextResponse.json({ error: 'Error al guardar las métricas' }, { status: 500 })
  }
}
