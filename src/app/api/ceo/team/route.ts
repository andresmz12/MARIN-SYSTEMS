import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AGENT_INFO, TOGGLEABLE, budgetStatus, clearBudgetCache, type AgentKey } from '@/lib/agent-ledger'
import { ownCompany, teamUser } from '@/lib/team-auth'

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

  const [settings, usage, activity, lessons, rejections, deadlines] = await Promise.all([
    prisma.agentSetting.findMany(),
    prisma.agentUsage.findMany({ where: { day: { gte: monthStart } } }),
    prisma.agentActivity.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    prisma.agentLesson.findMany({ where: { companyId: company.id }, orderBy: { createdAt: 'desc' }, take: 40 }),
    prisma.generatedPost.findMany({ where: { companyId: company.id, status: 'rejected', reviewNote: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 6, select: { id: true, topic: true, reviewNote: true, updatedAt: true } }),
    prisma.agentActivity.findFirst({ where: { agent: 'isabel', kind: 'deadlines' }, orderBy: { createdAt: 'desc' } }),
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
    deadlines: deadlines ? { at: deadlines.createdAt, items: (deadlines.detail as { items?: unknown[] } | null)?.items ?? [] } : null,
  })
}
