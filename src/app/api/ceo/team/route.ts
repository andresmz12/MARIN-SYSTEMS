import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AGENT_INFO, TOGGLEABLE, budgetStatus, clearBudgetCache, type AgentKey } from '@/lib/agent-ledger'
import { ownCompany, teamUser } from '@/lib/team-auth'
import { KIND_LABEL, mixOf } from '@/lib/post-kinds'

type MetricPost = { id: string; groupId: string | null; topic: string; platform: string; publishedAt: Date | null; externalUrl: string | null; kind: string | null; metric: { reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null } | null }
// Puntaje de interacción: guardar y compartir pesan más que un "me gusta".
const score = (m: NonNullable<MetricPost['metric']>) => (m.saves ?? 0) * 3 + (m.shares ?? 0) * 3 + (m.comments ?? 0) * 2 + (m.likes ?? 0)
function topOf(posts: MetricPost[]) {
  const best = new Map<string, MetricPost>()
  for (const p of posts) {
    if (!p.metric) continue
    const k = p.groupId ?? p.id
    const cur = best.get(k)
    if (!cur || score(p.metric) > score(cur.metric!)) best.set(k, p)
  }
  return Array.from(best.values()).sort((a, b) => score(b.metric!) - score(a.metric!)).slice(0, 5).map((p) => ({
    id: p.id, topic: p.topic, platform: p.platform, publishedAt: p.publishedAt, externalUrl: p.externalUrl, kind: p.kind, score: score(p.metric!),
    reach: p.metric!.reach, saves: p.metric!.saves, shares: p.metric!.shares, comments: p.metric!.comments, likes: p.metric!.likes,
  }))
}

export const dynamic = 'force-dynamic'

const COL = 5 * 3600 * 1000
const dayKey = (d: Date) => new Date(d.getTime() - COL).toISOString().slice(0, 10)

// Todo lo de la pestaña Equipo: agentes, actividad reciente, gasto, lecciones y últimas fechas de Isabel.
export async function GET(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const companyId = new URL(req.url).searchParams.get('companyId')
  const company = await ownCompany(u.userId, companyId)
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  clearBudgetCache()
  const budget = await budgetStatus()
  const now = new Date()
  const monthStart = dayKey(now).slice(0, 8) + '01'
  const weekAgo = dayKey(new Date(now.getTime() - 6 * 86400000))

  const [settings, usage, activity, lessons, rejections, deadlines, kindRows, metricPosts] = await Promise.all([
    prisma.agentSetting.findMany(),
    prisma.agentUsage.findMany({ where: { day: { gte: monthStart } } }),
    prisma.agentActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.agentLesson.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.generatedPost.findMany({ where: { companyId: company.id, status: 'rejected', reviewNote: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 6, select: { id: true, topic: true, reviewNote: true, updatedAt: true } }),
    prisma.agentActivity.findFirst({ where: { agent: 'isabel', kind: 'deadlines' }, orderBy: { createdAt: 'desc' } }),
    prisma.generatedPost.findMany({ where: { companyId: company.id, status: { not: 'rejected' }, createdAt: { gte: new Date(now.getTime() - 30 * 86400000) } }, distinct: ['groupId'], select: { kind: true, groupId: true } }),
    prisma.generatedPost.findMany({
      where: { companyId: company.id, status: 'published', publishedAt: { gte: new Date(now.getTime() - 150 * 86400000) }, metric: { isNot: null } },
      include: { metric: true }, orderBy: { publishedAt: 'desc' }, take: 80,
    }),
  ])

  const keys = Object.keys(AGENT_INFO) as AgentKey[]
  const agents = keys.map((k) => {
    const rows = usage.filter((x) => x.agent === k)
    const week = rows.filter((x) => x.day >= weekAgo)
    const st = settings.find((x) => x.agent === k)
    return {
      key: k,
      ...AGENT_INFO[k],
      toggleable: TOGGLEABLE.includes(k),
      enabled: st?.enabled ?? true,
      modelTier: st?.modelTier ?? 'default',
      costMonth: rows.reduce((a, b) => a + b.costUsd, 0),
      costWeek: week.reduce((a, b) => a + b.costUsd, 0),
      calls: rows.reduce((a, b) => a + b.calls, 0),
      last: activity.find((a) => a.agent === k)?.createdAt ?? null,
    }
  })
  return NextResponse.json({
    agents,
    totalMonth: agents.reduce((a, b) => a + b.costMonth, 0),
    budget,
    activity: activity.slice(0, 40),
    lessons,
    rejections,
    mix: mixOf(kindRows.map((r) => r.kind)).map((m) => ({ ...m, label: KIND_LABEL[m.kind] })),
    mixUntyped: kindRows.filter((r) => !r.kind).length,
    topPosts: topOf(metricPosts),
    deadlines: deadlines ? { at: deadlines.createdAt, items: (deadlines.detail as { items?: unknown[] } | null)?.items ?? [] } : null,
  })
}
