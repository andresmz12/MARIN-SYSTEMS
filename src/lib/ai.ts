import { AI_BLOCK_TYPES } from './ceo'

const AI_MODEL = 'claude-haiku-4-5-20251001'
const AI_MODEL_SMART = 'claude-sonnet-4-6'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// ──────────────────────── Shared helpers ────────────────────────

/** Extract the first balanced `{…}` JSON object from a raw model response. */
function extractJson(text: string): unknown | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

/** Call Anthropic Messages API, return the first text block. */
async function callAI(
  model: string,
  prompt: string,
  maxTokens: number,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) return ''
  const data: unknown = await res.json()
  const content = (data as { content?: { type: string; text?: string }[] }).content
  return content?.find((c) => c.type === 'text')?.text ?? ''
}

// ──────────────────────── Block content (plan generation) ────────────────────────

export interface BlockContentInput {
  companyName: string
  durationHours: number
  startTime: string
  endTime: string
  ideasInProgress: string[]
  ideasPending: string[]
  defaultBlockType: string
  voiceSamples?: string[]
  forbiddenWords?: string[]
}

export interface BlockContent {
  title: string
  description: string
  blockType: string
  steps: string[]
}

function fallbackBlockContent(input: BlockContentInput): BlockContent {
  const inProgress = input.ideasInProgress[0]
  const pending = input.ideasPending[0]
  let title: string
  if (inProgress) title = inProgress.slice(0, 60)
  else if (pending) title = `Desarrollar: ${pending}`.slice(0, 60)
  else title = `${input.companyName}: Operaciones y seguimiento`.slice(0, 60)
  return { title, description: `Bloque de ${input.durationHours}h enfocado en ${input.companyName}.`, blockType: input.defaultBlockType, steps: [] }
}

function coerceBlockContent(parsed: unknown, input: BlockContentInput): BlockContent {
  const fb = fallbackBlockContent(input)
  if (typeof parsed !== 'object' || parsed === null) return fb
  const obj = parsed as Record<string, unknown>
  const title = str(obj.title, fb.title).slice(0, 60)
  const description = str(obj.description, fb.description)
  const blockType = typeof obj.blockType === 'string' && AI_BLOCK_TYPES.includes(obj.blockType) ? obj.blockType : fb.blockType
  const steps = Array.isArray(obj.steps) ? obj.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 6) : []
  return { title, description, blockType, steps }
}

export async function generateBlockContent(input: BlockContentInput): Promise<BlockContent> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackBlockContent(input)

  const voiceLine = input.voiceSamples?.length
    ? `\nEscribe imitando el tono de estos ejemplos del dueño:\n${input.voiceSamples.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`
    : ''
  const forbiddenLine = input.forbiddenWords?.length
    ? `\nNUNCA uses estas palabras ni frases: ${input.forbiddenWords.join(', ')}.`
    : ''

  const prompt = `Eres el asistente personal de un CEO colombiano que maneja 6 empresas.${voiceLine}${forbiddenLine}
Genera el contenido para este bloque de trabajo:

Empresa: ${input.companyName}
Duración: ${input.durationHours}h
Ideas en progreso: ${input.ideasInProgress.join(', ') || 'ninguna'}
Ideas pendientes: ${input.ideasPending.slice(0, 3).join(', ') || 'ninguna'}
Hora del bloque: ${input.startTime} - ${input.endTime}

Responde ÚNICAMENTE con este JSON:
{
  "title": "título específico y accionable de máximo 60 chars",
  "description": "qué exactamente hacer en este bloque, 2-3 líneas específicas",
  "blockType": "marketing|sales|admin|deepwork",
  "steps": ["paso 1", "paso 2", "paso 3"]
}`
  try {
    const text = await callAI(AI_MODEL, prompt, 500)
    return coerceBlockContent(extractJson(text), input)
  } catch {
    return fallbackBlockContent(input)
  }
}

// ──────────────────────── Brand profile analysis ────────────────────────

export interface BrandAnalysisInput {
  companyName: string
  targetAudience: string
  tone: string
  competitors: string[]
  contentPillars: string[]
}

export interface BrandAnalysis {
  bestDays: string[]
  bestHours: Record<string, string>
  contentPillars: string[]
  competitorInsights: string
  recommendedFrequency: Record<string, number>
}

function fallbackBrandAnalysis(input: BrandAnalysisInput): BrandAnalysis {
  return {
    bestDays: ['Lunes', 'Miércoles', 'Viernes'],
    bestHours: { instagram: '7pm-9pm', tiktok: '12pm-2pm', email: '8am-10am' },
    contentPillars: input.contentPillars.length > 0 ? input.contentPillars : ['Educación', 'Casos de éxito', 'Detrás de escenas', 'Ofertas'],
    competitorInsights: 'Análisis no disponible sin conexión a internet.',
    recommendedFrequency: { instagram: 4, tiktok: 3, email: 1 },
  }
}

function coerceBrandAnalysis(parsed: unknown, input: BrandAnalysisInput): BrandAnalysis {
  const fb = fallbackBrandAnalysis(input)
  if (typeof parsed !== 'object' || parsed === null) return fb
  const obj = parsed as Record<string, unknown>

  const bestDays = Array.isArray(obj.bestDays)
    ? obj.bestDays.filter((s): s is string => typeof s === 'string').slice(0, 7)
    : fb.bestDays

  const bestHours = typeof obj.bestHours === 'object' && obj.bestHours !== null
    ? Object.fromEntries(Object.entries(obj.bestHours as Record<string, unknown>).map(([k, v]) => [k, str(v, '')]).filter(([, v]) => v))
    : fb.bestHours

  const contentPillars = Array.isArray(obj.contentPillars)
    ? obj.contentPillars.filter((s): s is string => typeof s === 'string').slice(0, 5)
    : fb.contentPillars

  const recommendedFrequency = typeof obj.recommendedFrequency === 'object' && obj.recommendedFrequency !== null
    ? Object.fromEntries(Object.entries(obj.recommendedFrequency as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'number' ? v : 3]))
    : fb.recommendedFrequency

  return {
    bestDays,
    bestHours,
    contentPillars,
    competitorInsights: str(obj.competitorInsights, fb.competitorInsights),
    recommendedFrequency,
  }
}

/**
 * Analyze a brand's market context using AI (with web search when available).
 * Falls back gracefully if the API key is missing.
 */
export async function analyzeBrand(input: BrandAnalysisInput): Promise<BrandAnalysis> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackBrandAnalysis(input)

  const prompt = `Eres un estratega de marketing digital experto en negocios latinos en USA y Colombia.

Analiza esta empresa y su industria de marketing digital:
Empresa: ${input.companyName}
Público objetivo: ${input.targetAudience}
Tono de marca: ${input.tone}
Pilares de contenido actuales: ${input.contentPillars.join(', ') || 'ninguno definido'}
Competidores mencionados: ${input.competitors.join(', ') || 'ninguno'}

Basándote en tu conocimiento de mercados latinos y mejores prácticas de redes sociales en 2025, responde ÚNICAMENTE con este JSON:
{
  "bestDays": ["Lunes", "Miércoles", "Viernes"],
  "bestHours": { "instagram": "7pm-9pm", "tiktok": "12pm-2pm", "email": "8am-10am" },
  "contentPillars": ["pilar 1", "pilar 2", "pilar 3", "pilar 4", "pilar 5"],
  "competitorInsights": "resumen de 2-3 líneas sobre qué hace la competencia y qué diferencia a esta empresa",
  "recommendedFrequency": { "instagram": 4, "tiktok": 3, "email": 1 }
}`

  try {
    // Try with web_search tool enabled (Sonnet), fall back to Haiku without web search.
    const text = await callAI(AI_MODEL_SMART, prompt, 1000, { 'anthropic-beta': 'web-search-2025-03-05' })
    if (text) return coerceBrandAnalysis(extractJson(text), input)
    const text2 = await callAI(AI_MODEL, prompt, 800)
    return coerceBrandAnalysis(extractJson(text2), input)
  } catch {
    return fallbackBrandAnalysis(input)
  }
}

// ──────────────────────── Marketing content generation ────────────────────────

export interface ContentGenerationInput {
  companyName: string
  platform: string
  contentType: string
  topic: string
  tone: string
  targetAudience: string
  contentPillars: string[]
  voiceSamples?: string[]
  forbiddenWords?: string[]
}

export interface GeneratedContent {
  topic: string
  copy: string
  hashtags: string[]
  cta: string
  contentNotes: string
}

function fallbackContent(input: ContentGenerationInput): GeneratedContent {
  return {
    topic: input.topic || `Contenido de ${input.contentType} para ${input.companyName}`,
    copy: `✨ ${input.companyName}\n\n[Contenido de ${input.contentType} para ${input.platform}]\n\n¿Listo para transformar tu negocio? ¡Escríbenos!`,
    hashtags: [`#${input.companyName.replace(/\s+/g, '')}`, '#negocios', '#latinos', '#emprendimiento'],
    cta: 'Escríbenos por DM o deja tu comentario 👇',
    contentNotes: `Crear ${input.contentType} para ${input.platform}. Tono: ${input.tone}.`,
  }
}

function coerceContent(parsed: unknown, input: ContentGenerationInput): GeneratedContent {
  const fb = fallbackContent(input)
  if (typeof parsed !== 'object' || parsed === null) return fb
  const obj = parsed as Record<string, unknown>

  const hashtags = Array.isArray(obj.hashtags)
    ? obj.hashtags.filter((s): s is string => typeof s === 'string').map((s) => s.startsWith('#') ? s : `#${s}`).slice(0, 15)
    : fb.hashtags

  return {
    topic: str(obj.topic, fb.topic),
    copy: str(obj.copy, fb.copy),
    hashtags,
    cta: str(obj.cta, fb.cta),
    contentNotes: str(obj.contentNotes, fb.contentNotes),
  }
}

/** Generate a complete marketing post ready to publish. Falls back gracefully. */
export async function generateMarketingContent(input: ContentGenerationInput): Promise<GeneratedContent> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackContent(input)

  const voiceLine = input.voiceSamples?.length
    ? `\nEscribe imitando el tono de estos ejemplos escritos por el dueño de la marca:\n${input.voiceSamples.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`
    : ''
  const forbiddenLine = input.forbiddenWords?.length
    ? `\nNUNCA uses estas palabras ni frases: ${input.forbiddenWords.join(', ')}.`
    : ''

  const prompt = `Eres un creador de contenido experto para negocios latinos en USA y Colombia.${voiceLine}${forbiddenLine}

Crea contenido de marketing listo para publicar:
Empresa: ${input.companyName}
Plataforma: ${input.platform}
Tipo de contenido: ${input.contentType}
Tema sugerido: ${input.topic || 'el más relevante según los pilares de contenido'}
Tono de marca: ${input.tone}
Público objetivo: ${input.targetAudience}
Pilares de contenido: ${input.contentPillars.join(', ')}

Instrucciones específicas por plataforma:
- Instagram/TikTok: usa emojis, copy corto y punchy (máximo 2200 chars), hashtags relevantes
- Email: asunto + cuerpo formal pero cálido, sin hashtags
- WhatsApp: mensaje directo y personal, máximo 500 chars

Responde ÚNICAMENTE con este JSON:
{
  "topic": "tema específico del contenido",
  "copy": "copy completo listo para publicar, con saltos de línea naturales y emojis apropiados",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "cta": "llamada a la acción específica y directa",
  "contentNotes": "notas de producción: qué grabar/fotografiar, duración sugerida, ángulo recomendado"
}`

  try {
    const text = await callAI(AI_MODEL_SMART, prompt, 1500)
    return coerceContent(extractJson(text), input)
  } catch {
    return fallbackContent(input)
  }
}

// ──────────────────────── Content angles generation ────────────────────────

export interface ContentAnglesInput {
  companyName: string
  targetAudience: string
  contentPillars: string[]
  competitors: string[]
}

export interface ContentAngle {
  angle: string
  hook: string
  sourceCompetitor: string | null
}

function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) as unknown[] } catch { return null }
      }
    }
  }
  return null
}

function coerceAngles(parsed: unknown[] | null): ContentAngle[] {
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      angle: str(item.angle),
      hook: str(item.hook),
      sourceCompetitor: typeof item.sourceCompetitor === 'string' && item.sourceCompetitor.trim() ? item.sourceCompetitor.trim() : null,
    }))
    .filter((a) => a.angle && a.hook)
    .slice(0, 5)
}

export async function generateContentAngles(input: ContentAnglesInput): Promise<ContentAngle[]> {
  if (!process.env.ANTHROPIC_API_KEY) return []

  const prompt = `Eres un estratega de contenido experto en negocios latinos en USA y Colombia.

Analiza los siguientes competidores de la empresa "${input.companyName}" y genera 5 ángulos de contenido diferenciadores.

Público objetivo: ${input.targetAudience}
Pilares de contenido: ${input.contentPillars.join(', ') || 'no definidos'}
Competidores: ${input.competitors.join(', ') || 'no especificados'}

Para cada competidor (o en general si no hay competidores), identifica qué ángulo de contenido NO están explotando y que esta empresa podría aprovechar.

Responde ÚNICAMENTE con este JSON array de exactamente 5 objetos:
[
  {
    "angle": "descripción del ángulo de contenido (máximo 100 chars)",
    "hook": "gancho concreto y específico para usar en el primer segundo del video/post (máximo 120 chars)",
    "sourceCompetitor": "nombre del competidor del que se extrajo el insight, o null si es general"
  }
]`

  try {
    const text = await callAI(AI_MODEL_SMART, prompt, 1200, { 'anthropic-beta': 'web-search-2025-03-05' })
    if (text) {
      const angles = coerceAngles(extractJsonArray(text))
      if (angles.length > 0) return angles
    }
    const text2 = await callAI(AI_MODEL, prompt, 1000)
    return coerceAngles(extractJsonArray(text2))
  } catch {
    return []
  }
}
