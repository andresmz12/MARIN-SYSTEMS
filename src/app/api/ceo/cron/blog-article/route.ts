import { NextResponse } from 'next/server'
import { backgroundCron } from '@/lib/cron-run'
import { agentJob, type ActivityLine } from '@/lib/agent-job'
import { writeBlogArticle } from '@/lib/blog-writer'

export const maxDuration = 300

// Luis escribe un artículo nuevo para el blog (español e inglés) y lo manda como borrador. Una vez por semana.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })
  const r = await writeBlogArticle()
  if (!r.ok) return NextResponse.json({ error: r.error, summary: [{ company: 'blog', created: 0, error: r.error }] }, { status: 500 })
  return NextResponse.json({ summary: [{ company: 'blog', created: r.created?.length ?? 0 }], topic: r.topic, urls: r.created?.map((c) => c.url), warnings: r.warnings })
}

const describe = (d: Record<string, unknown>): ActivityLine[] => {
  const s = (Array.isArray(d.summary) ? d.summary[0] : null) as { created?: number; error?: string } | null
  return s ? [{ text: s.error ? `No pudo escribir el artículo del blog: ${s.error}` : `Escribió un artículo para el blog (${s.created} ${s.created === 1 ? 'versión' : 'versiones'} como borrador)` }] : []
}
export const POST = backgroundCron('blog-article', agentJob('luis', handler, describe))
