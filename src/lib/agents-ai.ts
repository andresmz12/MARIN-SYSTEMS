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
${input.sourceUrl ? `Fuente original de la noticia: ${input.sourceUrl}\nHoy es ${new Date().toISOString().slice(0, 10)}. Abre esa fuente: confirma que el enlace corresponde a la noticia de la que habla el post y que su fecha es reciente. Si el post la presenta como una novedad y NO lo es (es una noticia vieja o una página fija), o el enlace no corresponde, agrega ese dato como "incorrecto" explicando por qué.\n` : ''}${input.library.length ? `\nBiblioteca del dueño (fuente confiable):\n${input.library.map((k, i) => `[${i + 1}] ${k}`).join('\n')}\n` : ''}
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

// ───────────────────────── Revisor de noticias ─────────────────────────

export interface NewsVet { accept: boolean; reason: string }

/**
 * Antes de escribir sobre una noticia: ¿vale la pena para esta audiencia y no repite algo ya publicado?
 * Es un filtro barato (sin búsqueda web): la veracidad ya se comprobó abriendo la fuente.
 */
export async function vetNews(input: {
  companyName: string
  targetAudience: string
  title: string
  date: string
  text: string
  pastTopics: string[]
}): Promise<NewsVet | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const prompt = `Eres el revisor de noticias de "${input.companyName}" (contabilidad, impuestos y negocios). Público: ${input.targetAudience}.
Decide si esta noticia merece un post. Hoy es ${new Date().toISOString().slice(0, 10)}.

NOTICIA (${input.date}): ${input.title}
Texto de la fuente: ${input.text.slice(0, 1800)}

Temas que YA publicamos o propusimos: ${input.pastTopics.slice(0, 40).join('; ') || 'ninguno'}

Recházala si: es un recordatorio genérico sin dato nuevo, no afecta de forma concreta a dueños de negocio, trabajadores independientes o contribuyentes latinos, es sobre algo muy específico que casi nadie usa, o repite un tema que ya publicamos (aunque sea otra noticia). Acéptala solo si aporta un dato concreto y útil.
Responde ÚNICAMENTE con este JSON: {"accept":true|false,"reason":"una frase"}`
  try {
    const text = await callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], maxTokens: 200 })
    const o = extractJson(text) as { accept?: unknown; reason?: unknown } | null
    if (!o || typeof o.accept !== 'boolean') return null
    return { accept: o.accept, reason: asStr(o.reason, 200) }
  } catch (err) {
    console.error('[vet-news]', err)
    return null
  }
}

// ───────────────────────── Investigador de noticias (web) ─────────────────────────

export interface DiscoveredNews { title: string; link: string; publishedAt: Date; source: string }

/**
 * Busca en la web noticias de los últimos 7 días de contabilidad, impuestos y pequeños negocios (más allá de
 * los feeds fijos). Lo que devuelve NO se publica por confiar en la IA: cada noticia se abre y se verifica
 * después (la página existe, es esa noticia y su fecha coincide).
 */
export async function discoverNews(input: {
  companyName: string
  targetAudience: string
  contentPillars: string[]
  pastTopics: string[]
}): Promise<DiscoveredNews[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []
  const today = new Date().toISOString().slice(0, 10)
  const prompt = `Eres el investigador de noticias de "${input.companyName}". Hoy es ${today}.
Público: ${input.targetAudience}
Pilares: ${input.contentPillars.join(', ') || 'impuestos y contabilidad para negocios'}
${input.pastTopics.length ? `Temas que YA publicamos (no repetir): ${input.pastTopics.slice(0, 40).join('; ')}\n` : ''}
Busca en la web NOTICIAS PUBLICADAS EN LOS ÚLTIMOS 7 DÍAS (con fecha de publicación visible en la página) sobre impuestos, contabilidad, nómina, formación de negocios y finanzas para pequeños negocios y trabajadores independientes en EE.UU. (incluye dueños latinos, ITIN y LLC).
Fuentes permitidas: oficiales (irs.gov, sba.gov, fincen.gov, dol.gov, treasury.gov, ssa.gov, sitios de estados) o medios de contabilidad reconocidos (journalofaccountancy.com, cpapracticeadvisor.com, accountingtoday.com, etc.). Nada de blogs personales, páginas de ventas, foros ni contenido sin fecha.
Para cada noticia: el titular EXACTO tal como aparece en la página, la URL EXACTA de esa noticia (no una portada ni un listado), la fecha de publicación que viste (AAAA-MM-DD) y el nombre de la fuente. No inventes: si no estás seguro de la fecha o de la URL, no la incluyas. Si no hay nada reciente y confiable, responde [].
Responde ÚNICAMENTE con este JSON array (máximo 4):
[{"title":"…","url":"https://…","date":"AAAA-MM-DD","source":"…"}]`
  try {
    const text = await callClaude({ model: AI_MODEL_SMART, messages: [{ role: 'user', content: prompt }], maxTokens: 1500, webSearch: true, maxSearches: 5 })
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start === -1 || end <= start) return []
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown[]
    const out: DiscoveredNews[] = []
    for (const i of arr) {
      if (typeof i !== 'object' || i === null) continue
      const o = i as Record<string, unknown>
      const link = asStr(o.url, 500)
      const title = asStr(o.title, 300)
      const date = new Date(`${asStr(o.date, 10)}T12:00:00Z`)
      if (!/^(https:\/\/|http:\/\/localhost[:/])/.test(link) || !title || isNaN(date.getTime())) continue
      out.push({ title, link, publishedAt: date, source: asStr(o.source, 80) })
    }
    return out.slice(0, 4)
  } catch (err) {
    console.error('[discover-news]', err)
    return []
  }
}
