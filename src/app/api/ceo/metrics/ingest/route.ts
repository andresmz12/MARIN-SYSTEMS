import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchPost, metricFields, type MetricItem } from '@/lib/metrics-match'
import { logActivity } from '@/lib/agent-ledger'

export const maxDuration = 60

// Make manda aquí las métricas leídas de Facebook/Instagram/LinkedIn. Se empareja cada publicación con nuestro post
// por enlace, texto o fecha. Se autentica como el callback: X-Webhook-Secret (PUBLISH_WEBHOOK_SECRET) o Bearer CRON_SECRET.
export async function POST(req: Request) {
  const secret = process.env.PUBLISH_WEBHOOK_SECRET
  const cron = process.env.CRON_SECRET
  const okSecret = !!secret && req.headers.get('X-Webhook-Secret') === secret
  const okCron = !!cron && req.headers.get('Authorization') === `Bearer ${cron}`
  if (!okSecret && !okCron) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { platform?: unknown; items?: unknown } | null
  const platform = typeof body?.platform === 'string' ? body.platform.toLowerCase() : ''
  if (!['facebook', 'instagram', 'linkedin'].includes(platform)) return NextResponse.json({ error: 'platform debe ser facebook, instagram o linkedin' }, { status: 400 })
  const items = (Array.isArray(body?.items) ? body!.items : []).filter((i): i is MetricItem => typeof i === 'object' && i !== null).slice(0, 100)
  if (items.length === 0) return NextResponse.json({ error: 'items vacío' }, { status: 400 })

  const posts = await prisma.generatedPost.findMany({
    where: { platform, status: 'published', publishedAt: { gte: new Date(Date.now() - 75 * 86400000) } },
    select: { id: true, copy: true, externalUrl: true, publishedAt: true, companyId: true },
  })
  const used = new Set<string>()
  let matched = 0
  const unmatched: string[] = []
  for (const item of items) {
    const post = matchPost(item, posts.filter((p) => !used.has(p.id)))
    if (!post) { unmatched.push((item.permalink ?? item.text ?? item.publishedAt ?? '?').slice(0, 80)); continue }
    used.add(post.id)
    const f = metricFields(item)
    await prisma.postMetric.upsert({
      where: { postId: post.id },
      create: { postId: post.id, ...f, source: 'make' },
      update: { ...f, source: 'make' },
    })
    if (item.permalink && !post.externalUrl && /^https?:\/\//.test(item.permalink)) await prisma.generatedPost.update({ where: { id: post.id }, data: { externalUrl: item.permalink } })
    matched++
  }
  await logActivity('samantha', 'metrics', `Recibió métricas de ${platform}: ${matched} posts emparejados${unmatched.length ? `, ${unmatched.length} sin pareja` : ''}`)
  return NextResponse.json({ ok: true, matched, unmatched })
}
