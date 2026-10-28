// Agentes programados de la agencia. Cada uno corre en su horario (cron), hace una tarea
// acotada y se apaga: nada trabaja todo el día. Lo rutinario usa el modelo económico y la
// verificación de datos el mejor, porque un dato de impuestos mal puesto sale caro.
import { AI_MODEL, AI_MODEL_SMART, callClaude, extractJson } from '@/lib/ai'

const asStr = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strList = (v: unknown, max: number, len = 300): string[] =>
  Array.isArray(v) ? v.map((x) => asStr(x, len)).filter(Boolean).slice(0, max) : []

// ───────────────────────── Verificador de datos ─────────────────────────

export type ClaimStatus = 'confirmado' | 'dudoso' | 'incorrecto' | 'sin_fuente'
export interface FactCheck {
  verdict: 'ok' | 'revisar' | 'error'
  summary: string
  items: { claim: string; status: ClaimStatus; note: string; source?: string }[]
}

const STATUSES: ClaimStatus[] = ['confirmado', 'dudoso', 'incorrecto', 'sin_fuente']

export function coerceFactCheck(parsed: unknown): FactCheck | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as Record<string, unknown>
  const items = (Array.isArray(o.items) ? o.items : [])
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      claim: asStr(i.claim, 200),
      status: (STATUSES as string[]).includes(String(i.status)) ? (i.status as ClaimStatus) : 'dudoso',
      note: asStr(i.note, 300),
      ...(asStr(i.source, 300) ? { source: asStr(i.source, 300) } : {}),
    }))
    .filter((i) => i.claim)
    .slice(0, 10)
  if (items.length === 0 && !asStr(o.summary)) return null
  // El veredicto lo decide el peor dato, no el modelo: un solo incorrecto basta para frenar.
  const verdict: FactCheck['verdict'] = items.some((i) => i.status === 'incorrecto')
    ? 'error'
    : items.some((i) => i.status !== 'confirmado') ? 'revisar' : 'ok'
  return { verdict, summary: asStr(o.summary, 400), items }
}

export async function factCheckPost(input: {
  companyName: string
  copy: string
  facts: string[]
  imageHeadline?: string
  sourceUrl?: string | null
  library: string[]
}): Promise<FactCheck | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const claims = input.facts.length > 0 ? input.facts : ['(no se listaron datos: extrae tú los datos concretos del texto)']
  const prompt = `Eres un verificador de datos riguroso para contenido de impuestos y finanzas de negocios latinos en USA. Tu trabajo es proteger al dueño de publicar un dato incorrecto.

Texto del post:
"""${input.copy.slice(0, 2500)}"""
${input.imageHeadline ? `Titular de la imagen: "${input.imageHeadline}"\n` : ''}Datos que declara el post:
${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}
${input.sourceUrl ? `Fuente original de la noticia: ${input.sourceUrl}\n` : ''}${input.library.length ? `\nBiblioteca del dueño (fuente confiable):\n${input.library.map((k, i) => `[${i + 1}] ${k}`).join('\n')}\n` : ''}
Para CADA dato concreto (montos, fechas, formularios, porcentajes, plazos, requisitos) del texto, del titular y de la lista, verifícalo con fuentes oficiales (IRS.gov, la biblioteca o la fuente indicada) y clasifícalo:
- "confirmado": coincide con una fuente oficial.
- "dudoso": no pudiste confirmarlo del todo o depende de la situación de cada persona.
- "incorrecto": contradice la fuente oficial.
- "sin_fuente": no encontraste fuente.
Sé estricto: ante la duda, "dudoso". No inventes fuentes; si citas una, debe ser una URL real que consultaste.

Responde ÚNICAMENTE con este JSON:
{"summary":"una frase para el dueño","items":[{"claim":"el dato","status":"confirmado|dudoso|incorrecto|sin_fuente","note":"qué encontraste o qué corregir","source":"URL o nombre de la fuente"}]}`
  try {
    const text = await callClaude({ model: AI_MODEL_SMART, messages: [{ role: 'user', content: prompt }], maxTokens: 1500, webSearch: true })
    return coerceFactCheck(extractJson(text))
  } catch (err) {
    console.error('[fact-check]', err)
    return null
  }
}

// ───────────────────────── Analista de métricas ─────────────────────────

export interface MetricRow {
  platform: string
  topic: string
  postedAt: string
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  clicks: number | null
}
export interface MetricsInsight {
  summary: string
  worked: string[]
  change: string[]
  nextTopics: string[]
}

export async function analyzeMetrics(input: { companyName: string; rows: MetricRow[] }): Promise<MetricsInsight | null> {
  if (!process.env.ANTHROPIC_API_KEY || input.rows.length === 0) return null
  const table = input.rows
    .map((r) => `${r.postedAt} | ${r.platform} | "${r.topic}" | alcance ${r.reach ?? '?'} | likes ${r.likes ?? '?'} | comentarios ${r.comments ?? '?'} | compartidos ${r.shares ?? '?'} | guardados ${r.saves ?? '?'} | clics ${r.clicks ?? '?'}`)
    .join('\n')
  const prompt = `Eres el analista de marketing de "${input.companyName}". Estos son los resultados de sus posts recientes:
${table}

Analiza SOLO con estos datos (no inventes cifras). Los "?" son datos que no se registraron: no los trates como cero. Si hay pocos datos, dilo.
Responde ÚNICAMENTE con este JSON:
{"summary":"2-3 frases con lo más importante","worked":["qué funcionó y por qué, citando el post"],"change":["qué cambiar, concreto y accionable"],"nextTopics":["temas o formatos concretos para probar la próxima semana"]}`
  try {
    const text = await callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], maxTokens: 900 })
    const o = extractJson(text) as Record<string, unknown> | null
    if (!o || !asStr(o.summary)) return null
    return { summary: asStr(o.summary, 600), worked: strList(o.worked, 4), change: strList(o.change, 4), nextTopics: strList(o.nextTopics, 5) }
  } catch (err) {
    console.error('[analyze-metrics]', err)
    return null
  }
}

// ───────────────────────── Investigador de temas ─────────────────────────

export interface ResearchedTopic { angle: string; hook: string; why: string; source?: string }

export async function researchTopics(input: {
  companyName: string
  targetAudience: string
  contentPillars: string[]
  recentTopics: string[]
  insightsHint: string[]
  today: string
}): Promise<ResearchedTopic[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const prompt = `Eres el investigador de temas de "${input.companyName}". Hoy es ${input.today}.
Público: ${input.targetAudience}
Pilares: ${input.contentPillars.join(', ') || 'no definidos'}
${input.recentTopics.length ? `Temas ya publicados o propuestos (NO repetir): ${input.recentTopics.join('; ')}\n` : ''}${input.insightsHint.length ? `Lo que mostraron las métricas recientes:\n${input.insightsHint.map((h) => `- ${h}`).join('\n')}\n` : ''}
Busca en la web qué es relevante AHORA para este público: cambios o noticias recientes, fechas límite próximas (ej. plazos del IRS en las próximas semanas), y preguntas frecuentes de temporada. Propón 3 temas concretos y oportunos. Usa solo hechos que encontraste; indica la fuente.
Responde ÚNICAMENTE con este JSON array:
[{"angle":"el tema en una frase (máx 100 caracteres)","hook":"gancho concreto para la primera línea (máx 120 caracteres)","why":"por qué es oportuno ahora","source":"URL de la fuente o vacío"}]`
  try {
    const text = await callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], maxTokens: 1200, webSearch: true })
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end <= start) return []
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown[]
    return arr
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map((i) => ({ angle: asStr(i.angle, 100), hook: asStr(i.hook, 120), why: asStr(i.why, 200), ...(asStr(i.source, 300) ? { source: asStr(i.source, 300) } : {}) }))
      .filter((t) => t.angle && t.hook)
      .slice(0, 3)
  } catch (err) {
    console.error('[research-topics]', err)
    return []
  }
}
