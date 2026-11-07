import { NextResponse } from 'next/server'
import { backgroundCron } from '@/lib/cron-run'
import { agentJob, type ActivityLine } from '@/lib/agent-job'
import { writeWeeklyArticles } from '@/lib/blog-writer'
import { runMirrors } from '@/lib/blog-mirror'

export const maxDuration = 300

// Luis: un artículo nuevo por semana para cada empresa con blog (español e inglés, como borrador) y el envío de los posts
// de redes a los blogs con "espejo" activo.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })
  const results = await writeWeeklyArticles()
  const mirrors = await runMirrors().catch(() => ({ sent: 0, errors: ['espejo falló'] }))
  const failed = results.filter((r) => !r.ok)
  const summary = results.map((r) => ({ company: r.company, created: r.created, ...(r.error ? { error: r.error } : {}) }))
  if (failed.length > 0 && failed.length === results.length) return NextResponse.json({ error: failed.map((f) => `${f.company}: ${f.error}`).join('; '), summary }, { status: 500 })
  return NextResponse.json({ summary, mirrored: mirrors.sent })
}

const describe = (d: Record<string, unknown>): ActivityLine[] => {
  const rows = (Array.isArray(d.summary) ? d.summary : []) as { company: string; created?: number; error?: string }[]
  return rows.map((s) => ({ text: !s.error && !s.created ? `Blog de ${s.company}: no hay artículos listos en la cola esta semana` : s.error ? `No pudo escribir el artículo del blog de ${s.company}: ${s.error}` : `Mandó un artículo al blog de ${s.company} (${s.created} ${s.created === 1 ? 'versión' : 'versiones'} como borrador)` }))
}
export const POST = backgroundCron('blog-article', agentJob('luis', handler, describe))
