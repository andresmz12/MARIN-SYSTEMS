import { NextRequest, NextResponse } from 'next/server'
import { AI_MODEL_RESEARCH, callClaude } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { logActivity, runAs } from '@/lib/agent-ledger'
import { ownCompany, teamUser } from '@/lib/team-auth'

export const maxDuration = 120

interface Deadline { date: string; title: string; who: string; source: string }

// Isabel (finanzas): busca en fuentes oficiales las próximas fechas límite de impuestos federales para negocios pequeños.
export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string }
  const company = await ownCompany(u.userId, b.companyId)
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + 75 * 86400000).toISOString().slice(0, 10)
  const prompt = `Eres Isabel, la agente de finanzas de "${company.name}". Hoy es ${today}.
Busca en la web, en fuentes OFICIALES (irs.gov, fincen.gov, dol.gov, ssa.gov), las fechas límite de impuestos y de cumplimiento federales de EE.UU. entre ${today} y ${end} que afectan a pequeños negocios, LLC y trabajadores independientes (self-employed, ITIN): pagos de impuesto estimado, formularios 1099 y W-2, extensiones, informes de nómina, etc.
Solo incluye fechas que viste confirmadas en una fuente oficial, con su enlace exacto. Si no estás seguro de una fecha, NO la incluyas. Si el día cae en fin de semana o feriado, usa la fecha ajustada que indica la fuente.
Responde ÚNICAMENTE con un JSON array (máximo 8, ordenado por fecha): [{"date":"AAAA-MM-DD","title":"nombre corto en español","who":"quién debe cumplirla, en español simple","source":"https://…"}]`
  try {
    const text = await runAs('isabel', () => callClaude({ model: AI_MODEL_RESEARCH, messages: [{ role: 'user', content: prompt }], maxTokens: 1800, webSearch: true, maxSearches: 3 }))
    const s = text.indexOf('['), e = text.lastIndexOf(']')
    const raw = s >= 0 && e > s ? (JSON.parse(text.slice(s, e + 1)) as Partial<Deadline>[]) : []
    const items = raw.filter((d): d is Deadline =>
      typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= today && d.date <= end &&
      typeof d.title === 'string' && typeof d.who === 'string' && typeof d.source === 'string' && /^https:\/\/([\w-]+\.)*(irs|fincen|dol|ssa|treasury)\.gov\//i.test(d.source),
    ).sort((a, c) => a.date.localeCompare(c.date))
    await logActivity('isabel', 'deadlines', items.length ? `Encontró ${items.length} ${items.length === 1 ? 'fecha límite' : 'fechas límite'} de impuestos para los próximos 75 días` : 'No encontró fechas límite confirmadas en fuentes oficiales', { companyId: company.id, detail: { items } })
    return NextResponse.json({ at: new Date().toISOString(), items })
  } catch (err) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: 'La IA devolvió algo ilegible. Intenta de nuevo.' }, { status: 502 })
    return NextResponse.json({ error: classifyAiError(err).message }, { status: 502 })
  }
}
