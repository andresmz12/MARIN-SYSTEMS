import { NextResponse } from 'next/server'
import { backgroundCron } from '@/lib/cron-run'
import { prisma } from '@/lib/prisma'
import { analyzeMetrics, type MetricRow } from '@/lib/agents-ai'
import { sendAgentReportEmail } from '@/lib/sendgrid-client'

export const maxDuration = 120

const WINDOW_DAYS = 28
// Con menos posts medidos no hay nada que concluir: mejor decirlo que inventar tendencias.
const MIN_POSTS = 3

// Analista de métricas: 1 vez por semana. Lee los números de los posts publicados, le pide a
// la IA económica qué funcionó y qué cambiar, deja el informe y avisa por correo. El generador
// de contenido lee ese informe la semana siguiente.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })

  try {
    const profiles = await prisma.brandProfile.findMany({
      where: { OR: [{ autoEnabled: true }, { newsEnabled: true }] },
      include: { company: { select: { id: true, name: true } } },
    })
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const summary: { company: string; posts: number; skipped?: string; error?: string }[] = []

    for (const profile of profiles) {
      const name = profile.company.name
      try {
        const posts = await prisma.generatedPost.findMany({
          where: { companyId: profile.companyId, status: 'published', publishedAt: { gte: since }, metric: { isNot: null } },
          include: { metric: true },
          orderBy: { publishedAt: 'desc' },
          take: 40,
        })
        if (posts.length < MIN_POSTS) {
          summary.push({ company: name, posts: posts.length, skipped: `solo ${posts.length} posts con métricas (mínimo ${MIN_POSTS})` })
          continue
        }
        const rows: MetricRow[] = posts.map((p) => ({
          platform: p.platform,
          topic: p.topic,
          postedAt: (p.publishedAt ?? p.createdAt).toISOString().slice(0, 10),
          reach: p.metric?.reach ?? null,
          likes: p.metric?.likes ?? null,
          comments: p.metric?.comments ?? null,
          shares: p.metric?.shares ?? null,
          saves: p.metric?.saves ?? null,
          clicks: p.metric?.clicks ?? null,
        }))
        const insight = await analyzeMetrics({ companyName: name, rows })
        if (!insight) {
          summary.push({ company: name, posts: posts.length, error: 'la IA no devolvió un análisis válido' })
          continue
        }
        await prisma.agentReport.create({
          data: { userId: profile.userId, companyId: profile.companyId, kind: 'metrics', title: `Resultados de ${name}`, content: { ...insight, posts: posts.length } as never },
        })
        const mail = await sendAgentReportEmail({
          title: `Resultados de la semana · ${name}`,
          intro: insight.summary,
          sections: [
            { heading: '✅ Lo que funcionó', items: insight.worked },
            { heading: '🔧 Qué cambiar', items: insight.change },
            { heading: '💡 Para probar', items: insight.nextTopics },
          ],
        })
        if (!mail.success) console.error('[cron/metrics-report] correo falló:', mail.error)
        summary.push({ company: name, posts: posts.length })
      } catch (err) {
        console.error(`[cron/metrics-report] ${name}`, err)
        summary.push({ company: name, posts: 0, error: String(err) })
      }
    }
    return NextResponse.json({ processed: profiles.length, summary })
  } catch (err) {
    console.error('[cron/metrics-report]', err)
    return NextResponse.json({ error: 'Error generando el informe de métricas' }, { status: 500 })
  }
}

export const POST = backgroundCron('metrics-report', handler)
