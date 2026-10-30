import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { AI_BLOCK_TYPES } from './ceo'
import { classifyAiError, failureOf, recordAiFailure, recordAiOk, type AiFailure } from './ai-health'

export const AI_MODEL = 'claude-haiku-4-5-20251001'
export const AI_MODEL_SMART = 'claude-sonnet-4-6'

// ──────────────────────── Shared helpers ────────────────────────

/** Extract the first balanced `{…}` JSON object from a raw model response. */
export function extractJson(text: string): unknown | null {
  // Recorre el texto buscando objetos JSON de primer nivel (respetando cadenas y escapes, para que una llave dentro de un
  // texto no rompa la cuenta) y devuelve el ÚLTIMO que se pueda leer: con búsqueda web, el modelo suele comentar antes
  // y la respuesta final va al final.
  let found: unknown | null = null
  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue }
    let depth = 0
    let inStr = false
    let esc = false
    let end = -1
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) { end = j; break } }
    }
    if (end === -1) break
    try { found = JSON.parse(text.slice(i, end + 1)) } catch { /* no era JSON: se sigue buscando */ }
    i = end + 1
  }
  return found
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

// ──────────────────────── Central AI caller ────────────────────────

/**
 * Central Anthropic SDK caller with exponential backoff retry on 429/529.
 * All AI calls in this app route through here.
 */
export async function callClaude({
  model,
  system,
  messages,
  maxTokens,
  webSearch = false,
  maxSearches = 3,
}: {
  model: string
  system?: string
  messages: Anthropic.MessageParam[]
  maxTokens: number
  webSearch?: boolean
  maxSearches?: number
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''

  // Tope de 3 min por llamada: si la IA se cuelga, la corrida falla en vez de quedar "en curso" para siempre.
  const client = new Anthropic({ apiKey, timeout: 180_000, maxRetries: 1 })
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    messages,
  }
  if (system) params.system = system
  // Web search is a server-side tool — it must be declared in `tools`, not toggled
  // via a header. Bounded to 3 searches per call to cap cost/latency.
  if (webSearch) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches } as any]
  }

  const extractText = (msg: Anthropic.Message) =>
    msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

  const delays = [2000, 4000]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let convo = messages
      let msg = await client.messages.create({ ...params, messages: convo })
      // Server-side tool loop: continue while the model pauses to run web searches.
      let guard = 0
      while (msg.stop_reason === 'pause_turn' && guard < 4) {
        guard++
        convo = [...convo, { role: 'assistant', content: msg.content }]
        msg = await client.messages.create({ ...params, messages: convo })
      }
      void recordAiOk()
      return extractText(msg)
    } catch (err) {
      const status = err instanceof APIError ? (err.status ?? 0) : 0
      if ((status === 429 || status === 529) && attempt < 2) {
        await new Promise((r) => setTimeout(r, delays[attempt]))
        continue
      }
      await recordAiFailure(classifyAiError(err))
      throw err
    }
  }
  return ''
}

/** Internal helper: single-turn text call via callClaude. */
async function callAI(model: string, prompt: string, maxTokens: number, webSearch = false): Promise<string> {
  return callClaude({ model, messages: [{ role: 'user', content: prompt }], maxTokens, webSearch })
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
    const text = await callAI(AI_MODEL_SMART, prompt, 1000, true)
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
  angles?: { angle: string; hook: string }[]
  pillar?: string
  /** Referencias de estilo de la marca (links o textos de posts que le gustan al dueño). */
  references?: string[]
  /** Notas de posts rechazados/ajustados, para no repetir los mismos errores. */
  feedback?: string[]
  /** Fragmentos de la biblioteca de conocimiento (impuestos, guías): única fuente permitida para datos concretos. */
  knowledge?: string[]
  /** Permite buscar en la web (fuentes oficiales como irs.gov) para dar detalles concretos antes de escribir. */
  research?: boolean
}

import { parseImageText, type ImageText } from './image-prompt'

export interface GeneratedContent {
  topic: string
  copy: string
  hashtags: string[]
  cta: string
  contentNotes: string
  /** Descripción de la ESCENA de la imagen (en inglés, sin texto ni colores). */
  imagePrompt: string
  /** Texto que debe aparecer escrito EN la imagen (en español). */
  imageText: ImageText | null
  /** Datos concretos del post (montos, fechas, formularios) para que el dueño los verifique. */
  facts: string[]
  /** Solo si la IA falló y el texto es de relleno: por qué falló. */
  failure?: AiFailure
}

function fallbackContent(input: ContentGenerationInput): GeneratedContent {
  return {
    topic: input.topic || `Contenido de ${input.contentType} para ${input.companyName}`,
    copy: `✨ ${input.companyName}\n\n[Contenido de ${input.contentType} para ${input.platform}]\n\n¿Listo para transformar tu negocio? ¡Escríbenos!`,
    hashtags: [`#${input.companyName.replace(/\s+/g, '')}`, '#negocios', '#latinos', '#emprendimiento'],
    cta: 'Escríbenos por DM o deja tu comentario 👇',
    contentNotes: `Crear ${input.contentType} para ${input.platform}. Tono: ${input.tone}.`,
    imagePrompt: `Clean, professional composition for ${input.companyName}, ${input.tone} brand mood.`,
    imageText: null,
    facts: [],
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
    imagePrompt: str(obj.imagePrompt, fb.imagePrompt),
    imageText: parseImageText(obj.imageText),
    facts: Array.isArray(obj.facts)
      ? obj.facts.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => f.trim()).slice(0, 6)
      : [],
  }
}

/** Generate a complete marketing post ready to publish. Falls back gracefully. */
export async function generateMarketingContent(input: ContentGenerationInput): Promise<GeneratedContent> {
  if (!process.env.ANTHROPIC_API_KEY) return { ...fallbackContent(input), failure: failureOf('no_key') }

  const voiceLine = input.voiceSamples?.length
    ? `\nEscribe imitando el tono de estos ejemplos escritos por el dueño de la marca:\n${input.voiceSamples.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`
    : ''
  const forbiddenLine = input.forbiddenWords?.length
    ? `\nNUNCA uses estas palabras ni frases: ${input.forbiddenWords.join(', ')}.`
    : ''
  const anglesLine = input.angles?.length
    ? `\nBasa el contenido en uno de estos ángulos diferenciadores (elige el más relevante y NO repitas los ya usados):\n${input.angles.map((a, i) => `${i + 1}. Ángulo: ${a.angle} — Gancho: "${a.hook}"`).join('\n')}`
    : ''
  const referencesLine = input.references?.length
    ? `\nReferencias de estilo que le gustan al dueño (inspírate en su estilo, estructura y ritmo; NO las copies):\n${input.references.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : ''
  const feedbackLine = input.feedback?.length
    ? `\nEl dueño rechazó o corrigió posts anteriores con estas notas, evita repetir esos errores:\n${input.feedback.map((f) => `- ${f}`).join('\n')}`
    : ''
  const knowledgeLine = input.knowledge?.length
    ? `\nBIBLIOTECA DE CONOCIMIENTO (fuente confiable del dueño). Para montos, fechas, formularios y requisitos usa SOLO lo que dice esta biblioteca o el texto del tema; si algo no está aquí, no lo afirmes:\n${input.knowledge.map((k, i) => `[${i + 1}] ${k}`).join('\n')}`
    : ''
  const pillarLine = input.pillar
    ? `\nPilar de contenido de esta pieza (enfócala aquí): ${input.pillar}`
    : ''

  const prompt = `Eres un creador de contenido experto para negocios latinos en USA y Colombia.${voiceLine}${forbiddenLine}${anglesLine}${pillarLine}${knowledgeLine}${referencesLine}${feedbackLine}

Hoy es ${new Date().toISOString().slice(0, 10)}.
CALIDAD EDITORIAL (obligatoria): el post debe enseñar algo concreto que la persona no sabía, no repetir un titular.
- Explica en español simple CADA sigla o término técnico la primera vez que aparece, con su nombre completo (ej: "EITC, el crédito por ingreso del trabajo"). Nunca dejes una sigla sin explicar, ni en el texto ni dentro de la imagen.
- Incluye un EJEMPLO concreto con números cuando los datos lo permitan (ej: "Una familia con 2 hijos y un ingreso de $45,000 podría recibir…"), marcado como ejemplo de referencia.
- Di quién califica, quién NO, qué debe hacer y hasta cuándo, con datos oficiales.
- Ángulo para nuestra audiencia: dueños de negocio y trabajadores independientes latinos (self-employed, ITIN, LLC). Explica qué cambia para ellos.
- Si la fuente es un resumen general de una ley o de varias medidas, NO las enumeres todas de forma superficial: elige UNA medida concreta (la que más afecta a nuestra audiencia) y explícala a fondo; menciona que hay más y que pueden escribirnos. Mejor una cosa bien explicada que cinco a medias.
- Piensa en un post que valga la pena GUARDAR: una lista, un paso a paso o un dato que la persona querrá volver a consultar. Cierra invitando a guardarlo o a escribirnos.
- Vocabulario de latinos en EE.UU.: "impuestos", "preparación de impuestos", "declarar tus impuestos", "contador". NO uses "asesoría fiscal", "Hacienda", "fisco" ni "declaración de la renta" (son usos de otros países).
- Sin relleno ni frases vacías ("es clave revisar"). Cada línea debe aportar un dato, una explicación o una acción.
- Todo texto que irá escrito en la imagen va en español; solo los nombres oficiales de formularios y créditos pueden ir en inglés, y siempre con su explicación en español.${input.research ? '\n- Antes de escribir, BUSCA en la web en fuentes oficiales (irs.gov y similares) los detalles concretos: montos del año, requisitos, fechas y un ejemplo. Si un dato no está en una fuente oficial, no lo afirmes. Cada dato va en "facts" con su fuente. Usa SOLO información vigente: indica el año de cada monto o fecha y nunca presentes como novedad algo de años anteriores. Si no encuentras información actual y oficial sobre el tema, dilo en \"contentNotes\" en vez de inventar.' : ''}

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
- Facebook: tono cercano y conversacional, 1-3 párrafos cortos, pregunta que invite a comentar, máximo 3 hashtags
- LinkedIn: contenido INFORMATIVO y educativo sobre impuestos (taxes), LLC, ITIN y finanzas para negocios latinos en USA. Abre con un dato concreto (monto, fecha, formulario) en una línea; explica en 3-5 párrafos cortos de 1-2 frases; cierra con una pregunta o invitación suave a comentar. Tono profesional y de autoridad, sin promesas ni garantías, casi sin emojis, máximo 3 hashtags. Si das cifras o fechas, indica que son de referencia y que conviene confirmarlas en IRS.gov o con un profesional.
- Twitter/X: UN solo post de máximo 250 caracteres EN TOTAL contando los hashtags (límite duro de 280). Gancho fuerte en la primera frase, un dato o idea clara, tono directo; máximo 2 hashtags y casi sin emojis.
- Email: asunto + cuerpo formal pero cálido, sin hashtags
- WhatsApp: mensaje directo y personal, máximo 500 chars

Responde ÚNICAMENTE con este JSON:
{
  "topic": "tema específico del contenido",
  "copy": "copy completo listo para publicar, con saltos de línea naturales y emojis apropiados",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "cta": "llamada a la acción específica y directa",
  "contentNotes": "notas de producción: qué grabar/fotografiar, duración sugerida, ángulo recomendado",
  "imagePrompt": "SOLO la escena visual de la imagen, en inglés, sin texto escrito, sin colores y sin proporciones (eso lo agrega el sistema). Si imageText.face es true: describe la pose y el entorno de nuestra vocera (NO su apariencia: la imagen de referencia la define), por ejemplo 'sitting at a desk reviewing documents, smiling at the camera'. Si es false: describe una composición de infografía con íconos y formas, SIN personas ni caras",
  "imageText": {
    "face": "true si el post es un consejo, una noticia que afecta a la gente o una invitación a contactarnos (sale la cara de la marca); false si es de datos duros como fechas límite, montos, listas de formularios o comparaciones (infografía sin personas). Aproximadamente la mitad de los posts debe llevar cara",
    "headline": "texto principal EN la imagen, en español con acentos correctos, máximo 7 palabras, con el dato o gancho más fuerte",
    "subheadline": "una línea de apoyo, máximo 14 palabras",
    "keyFact": "el dato más importante en grande, que se entienda SOLO, sin siglas sueltas: un monto, una fecha o un formulario, máximo 8 palabras (ej: 'Hasta $7,830 de crédito por hijos'). Solo datos que estén en 'facts'",
    "bullets": ["de 3 a 5 puntos con información útil y concreta, máximo 10 palabras cada uno; cada sigla explicada; en español; al menos uno con un ejemplo o una cifra"],
    "cta": "acción final corta, máximo 5 palabras (ej: 'Guarda este post' o 'Agenda tu cita hoy')"
  },
  "facts": ["cada dato verificable que usaste en el copy o la imagen: montos, fechas, formularios, porcentajes, plazos, para que el dueño los confirme en IRS.gov"]
}`

  let text = ''
  let failure: AiFailure | undefined
  try {
    text = await callAI(AI_MODEL_SMART, prompt, input.research ? 4000 : 1500, !!input.research)
  } catch (err) {
    console.error('[generate-content] la llamada a la IA falló:', err instanceof Error ? err.message : err)
    failure = classifyAiError(err)
  }
  const parsed = extractJson(text)
  if (parsed && typeof parsed === 'object') return coerceContent(parsed, input)
  console.error('[generate-content] respuesta sin JSON válido:', text.slice(0, 300))
  // Si la búsqueda en la web fue lo que falló (límite, tiempo, texto raro), se reintenta sin ella antes de rendirse.
  // Sin crédito o con la clave mala no sirve reintentar.
  const hopeless = failure?.kind === 'credits' || failure?.kind === 'auth'
  if (input.research && !hopeless) return generateMarketingContent({ ...input, research: false })
  return { ...fallbackContent(input), failure: failure ?? failureOf('other') }
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
    const text = await callAI(AI_MODEL_SMART, prompt, 1200, true)
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

// ──────────────────────── Marketing campaign plan ────────────────────────

export interface CampaignPlanInput {
  companyName: string
  objective: string
  month: string // e.g. "2026-07" or "julio 2026"
  targetAudience: string
  tone: string
  contentPillars: string[]
  competitors: string[]
}

export interface CampaignWeek {
  week: number
  theme: string
  focus: string
  contentIdeas: string[]
}

export interface CampaignPlan {
  bigIdea: string
  pillars: string[]
  weeks: CampaignWeek[]
  kpis: string[]
}

function fallbackCampaignPlan(input: CampaignPlanInput): CampaignPlan {
  const pillars = input.contentPillars.length > 0
    ? input.contentPillars.slice(0, 5)
    : ['Educación', 'Casos de éxito', 'Detrás de escenas', 'Ofertas']
  return {
    bigIdea: `Posicionar a ${input.companyName} alrededor de: ${input.objective}.`,
    pillars,
    weeks: [1, 2, 3, 4].map((w) => ({
      week: w,
      theme: pillars[(w - 1) % pillars.length],
      focus: `Semana enfocada en ${pillars[(w - 1) % pillars.length].toLowerCase()} para avanzar el objetivo.`,
      contentIdeas: ['Reel educativo', 'Post de caso real', 'Historia con CTA'],
    })),
    kpis: ['Alcance semanal', 'Interacciones por post', 'Leads / DMs generados'],
  }
}

function coerceCampaignPlan(parsed: unknown, input: CampaignPlanInput): CampaignPlan {
  const fb = fallbackCampaignPlan(input)
  if (typeof parsed !== 'object' || parsed === null) return fb
  const obj = parsed as Record<string, unknown>

  const pillars = Array.isArray(obj.pillars)
    ? obj.pillars.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 5)
    : fb.pillars

  const weeks = Array.isArray(obj.weeks)
    ? obj.weeks
        .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
        .map((w, i) => ({
          week: typeof w.week === 'number' ? w.week : i + 1,
          theme: str(w.theme, pillars[i % Math.max(pillars.length, 1)] ?? `Semana ${i + 1}`),
          focus: str(w.focus, ''),
          contentIdeas: Array.isArray(w.contentIdeas)
            ? w.contentIdeas.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 4)
            : [],
        }))
        .slice(0, 4)
    : fb.weeks

  const kpis = Array.isArray(obj.kpis)
    ? obj.kpis.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 5)
    : fb.kpis

  return {
    bigIdea: str(obj.bigIdea, fb.bigIdea),
    pillars: pillars.length > 0 ? pillars : fb.pillars,
    weeks: weeks.length > 0 ? weeks : fb.weeks,
    kpis: kpis.length > 0 ? kpis : fb.kpis,
  }
}

/** Generate a month-long marketing campaign plan. Grounded with web search; falls back gracefully. */
export async function generateCampaignPlan(input: CampaignPlanInput): Promise<CampaignPlan> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackCampaignPlan(input)

  const prompt = `Eres un estratega de marketing digital experto en negocios latinos en USA y Colombia.

Diseña un plan de mercadeo de un mes para esta empresa. Investiga tendencias actuales relevantes con búsqueda web cuando aporte valor.

Empresa: ${input.companyName}
Objetivo del mes: ${input.objective}
Mes: ${input.month}
Público objetivo: ${input.targetAudience}
Tono de marca: ${input.tone}
Pilares actuales: ${input.contentPillars.join(', ') || 'no definidos'}
Competidores: ${input.competitors.join(', ') || 'no especificados'}

El plan debe tener una gran idea central, 3-5 pilares afinados al objetivo, 4 semanas con tema y enfoque concreto, y KPIs medibles.

Responde ÚNICAMENTE con este JSON:
{
  "bigIdea": "narrativa central del mes en 1-2 oraciones",
  "pillars": ["pilar 1", "pilar 2", "pilar 3"],
  "weeks": [
    { "week": 1, "theme": "tema de la semana", "focus": "enfoque concreto en 1-2 oraciones", "contentIdeas": ["idea 1", "idea 2", "idea 3"] }
  ],
  "kpis": ["kpi medible 1", "kpi medible 2"]
}
Incluye exactamente 4 semanas (week 1 a 4).`

  try {
    const text = await callAI(AI_MODEL_SMART, prompt, 1600, true)
    if (text) {
      const plan = coerceCampaignPlan(extractJson(text), input)
      if (plan.weeks.length > 0) return plan
    }
    const text2 = await callAI(AI_MODEL, prompt, 1400)
    return coerceCampaignPlan(extractJson(text2), input)
  } catch {
    return fallbackCampaignPlan(input)
  }
}
