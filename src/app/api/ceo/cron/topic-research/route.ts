import { NextResponse } from 'next/server'
import { backgroundCron } from '@/lib/cron-run'
import { prisma } from '@/lib/prisma'
import { researchTopics } from '@/lib/agents-ai'
import { latestInsights } from '@/lib/auto-content'

export const maxDuration = 180

// No acumular más ideas sin usar de las que el piloto automático consume.
const MAX_NEW_ANGLES = 8

// Investigador de temas: 1 vez al día. Busca en la web qué es oportuno ahora (cambios, fechas
// límite, preguntas de temporada) y deja 3 ideas como "ángulos", que el piloto automático ya
// sabe usar al generar la semana.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })

  try {
    const profiles = await prisma.brandProfile.findMany({
      where: { autoEnabled: true },
      include: { company: { select: { id: true, name: true } } },
    })
    const summary: { company: string; created: number; skipped?: string; error?: string }[] = []

    for (const profile of profiles) {
      const name = profile.company.name
      try {
        const open = await prisma.contentAngle.count({ where: { companyId: profile.companyId, status: 'new' } })
        if (open >= MAX_NEW_ANGLES) {
          summary.push({ company: name, created: 0, skipped: `${open} ideas sin usar` })
          continue
        }
        const [angles, posts] = await Promise.all([
          prisma.contentAngle.findMany({ where: { companyId: profile.companyId }, orderBy: { createdAt: 'desc' }, take: 20, select: { angle: true } }),
          prisma.generatedPost.findMany({ where: { companyId: profile.companyId }, orderBy: { createdAt: 'desc' }, take: 20, distinct: ['topic'], select: { topic: true } }),
        ])
        const known = [...angles.map((a) => a.angle), ...posts.map((p) => p.topic)]
        const topics = await researchTopics({
          companyName: name,
          targetAudience: profile.targetAudience,
          contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
          recentTopics: known.slice(0, 25),
          insightsHint: await latestInsights(profile.companyId),
          today: new Date().toISOString().slice(0, 10),
        })
        const seen = new Set(known.map((k) => k.toLowerCase().trim()))
        const fresh = topics.filter((t) => !seen.has(t.angle.toLowerCase().trim()))
        for (const t of fresh) {
          await prisma.contentAngle.create({
            data: { companyId: profile.companyId, angle: t.angle, hook: t.hook, sourceCompetitor: t.source ?? null },
          })
        }
        if (fresh.length > 0) {
          await prisma.agentReport.create({
            data: { userId: profile.userId, companyId: profile.companyId, kind: 'topics', title: `Temas para ${name}`, content: { topics: fresh } as never },
          })
        }
        summary.push({ company: name, created: fresh.length })
      } catch (err) {
        console.error(`[cron/topic-research] ${name}`, err)
        summary.push({ company: name, created: 0, error: String(err) })
      }
    }
    return NextResponse.json({ processed: profiles.length, summary })
  } catch (err) {
    console.error('[cron/topic-research]', err)
    return NextResponse.json({ error: 'Error investigando temas' }, { status: 500 })
  }
}

export const POST = backgroundCron('topic-research', handler)
