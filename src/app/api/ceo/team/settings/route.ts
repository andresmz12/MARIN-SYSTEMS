import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { TOGGLEABLE, clearBudgetCache, clearSettingsCache, logActivity, type AgentKey } from '@/lib/agent-ledger'
import { teamUser } from '@/lib/team-auth'

// Enciende/apaga un agente o cambia su nivel de modelo (default | smart | cheap).
export async function PATCH(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { agent?: string; enabled?: boolean; modelTier?: string; budgetUsd?: number }
  // Tope mensual de gasto de IA
  if (typeof b.budgetUsd === 'number') {
    if (!(b.budgetUsd >= 1 && b.budgetUsd <= 500)) return NextResponse.json({ error: 'El tope debe estar entre $1 y $500' }, { status: 400 })
    const row = await prisma.agentSetting.upsert({ where: { agent: 'budget' }, create: { agent: 'budget', budgetUsd: b.budgetUsd }, update: { budgetUsd: b.budgetUsd } })
    clearBudgetCache()
    await prisma.aiStatus.updateMany({ where: { id: 'main', failKind: 'budget' }, data: { failKind: null, failMessage: null, okAt: new Date() } })
    await logActivity('system', 'setting', `Cambiaste el tope mensual de IA a $${b.budgetUsd.toFixed(2)}`)
    return NextResponse.json(row)
  }
  if (!b.agent || !TOGGLEABLE.includes(b.agent as AgentKey)) return NextResponse.json({ error: 'Agente no válido' }, { status: 400 })
  const data: { enabled?: boolean; modelTier?: string } = {}
  if (typeof b.enabled === 'boolean') data.enabled = b.enabled
  if (b.modelTier && ['default', 'smart', 'cheap'].includes(b.modelTier)) data.modelTier = b.modelTier
  const row = await prisma.agentSetting.upsert({ where: { agent: b.agent }, create: { agent: b.agent, ...data }, update: data })
  clearSettingsCache()
  await logActivity(b.agent as AgentKey, 'setting', typeof data.enabled === 'boolean' ? (data.enabled ? 'Lo encendiste' : 'Lo apagaste') : `Cambiaste su modelo a "${data.modelTier}"`)
  return NextResponse.json(row)
}
