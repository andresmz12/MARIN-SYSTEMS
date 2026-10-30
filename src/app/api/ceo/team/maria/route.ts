import { NextRequest, NextResponse } from 'next/server'
import { AI_MODEL, callClaude, extractJson } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { logActivity, runAs } from '@/lib/agent-ledger'
import { lintPost } from '@/lib/compliance'
import { ownCompany, teamUser } from '@/lib/team-auth'

export const maxDuration = 60

// María (comunidad): te propone respuestas a un comentario o mensaje que pegas. No envía nada: tú copias la que te guste.
export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; message?: string; network?: string }
  const company = await ownCompany(u.userId, b.companyId)
  const message = b.message?.trim().slice(0, 1200)
  if (!company || !message) return NextResponse.json({ error: 'Pega el comentario o mensaje' }, { status: 400 })

  const prompt = `Eres María, la community manager de "${company.name}" (impuestos y contabilidad para latinos en EE.UU.). Alguien escribió esto${b.network ? ` en ${b.network}` : ''}:
"""${message}"""

Escribe 3 borradores de respuesta, cada uno con un tono distinto (cercano, breve, más formal).
REGLAS: español latino simple; máximo 40 palabras cada uno; sin promesas ni garantías de ahorro o resultados; no des cifras ni consejos personales de impuestos por aquí: invita a escribir por mensaje directo o a agendar una cita; no pidas datos sensibles (número de Seguro Social, cuentas); si es una queja, empieza reconociendo la molestia; si parece spam o una estafa, dilo y no respondas.
Responde ÚNICAMENTE con este JSON:
{"intent":"pregunta|elogio|queja|spam|otro","replies":[{"tone":"cercano","text":"…"},{"tone":"breve","text":"…"},{"tone":"formal","text":"…"}],"note":"una frase para el dueño (ej: ojo, pide un monto exacto)"}`
  try {
    const text = await runAs('maria', () => callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], maxTokens: 900 }))
    const d = extractJson(text) as { intent?: string; replies?: { tone?: string; text?: string }[]; note?: string } | null
    const replies = (d?.replies ?? []).filter((r) => typeof r.text === 'string' && r.text.trim()).slice(0, 3).map((r) => ({
      tone: String(r.tone ?? ''),
      text: String(r.text).trim(),
      flags: lintPost({ copy: String(r.text) }).filter((i) => i.level === 'error').map((i) => i.message),
    }))
    if (replies.length === 0) return NextResponse.json({ error: 'No pude armar las respuestas. Intenta de nuevo.' }, { status: 502 })
    await logActivity('maria', 'reply', `Preparó ${replies.length} respuestas (${d?.intent ?? 'mensaje'}) para ${company.name}`, { companyId: company.id })
    return NextResponse.json({ intent: d?.intent ?? 'otro', replies, note: d?.note ?? '' })
  } catch (err) {
    return NextResponse.json({ error: classifyAiError(err).message }, { status: 502 })
  }
}
