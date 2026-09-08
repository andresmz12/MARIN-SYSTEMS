import Anthropic from '@anthropic-ai/sdk'
import { extractJson } from './ai'

const VISION_MODEL = 'claude-sonnet-5'
const MAX_IMAGES = 8 // keeps the request (and cost) bounded for very long meetings

export interface MeetingExtraction {
  summary: string
  tasks: string[]
}

function coerceExtraction(parsed: unknown): MeetingExtraction {
  if (typeof parsed !== 'object' || parsed === null) return { summary: '', tasks: [] }
  const obj = parsed as Record<string, unknown>
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  const tasks = Array.isArray(obj.tasks)
    ? obj.tasks.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()).slice(0, 30)
    : []
  return { summary, tasks }
}

const EXTRACTION_INSTRUCTIONS = `Vas a recibir las páginas de un cuaderno de reunión de negocios (en español): algunas son fotos de notas manuscritas (léelas lo mejor que puedas) y puede venir además un volcado de texto de mapas mentales (ese texto ya es exacto, no necesita lectura).

Genera:
1. Un resumen elaborado y bien redactado de TODO el contenido (varios párrafos si hace falta, en prosa clara) — integra tanto las notas como los mapas mentales en un solo relato coherente de la reunión.
2. Una lista de tareas — pero SOLO cuenta como tarea lo marcado explícitamente como tal. Señales de que algo es una tarea:
   - Está numerado o etiquetado: "Tarea 1)", "Tarea:", "TO DO", "Pendiente:", "Acción:".
   - Tiene una casilla dibujada al lado (☐, un cuadrado u óvalo vacío) — lista de chequeo.
   - Empieza con un verbo en infinitivo o imperativo claro de acción ("Llamar a...", "Enviar...", "Revisar...").
   No conviertas en tarea una nota informativa, una idea o una observación solo porque suena importante — la mayoría de lo escrito son notas, NO tareas. Ante la duda, no la incluyas como tarea.

Si la letra es ilegible en partes, ignora esas partes en vez de inventar contenido.

Responde ÚNICAMENTE con este JSON:
{"summary": "resumen elaborado aquí", "tasks": ["tarea 1", "tarea 2"]}`

/**
 * Reads PNG snapshots of a meeting's ink pages (base64, no data: prefix) plus a
 * plain-text dump of its mind-map pages, and returns an elaborated summary and
 * extracted action items. Vision quality for handwriting depends entirely on
 * legibility; mind-map text is exact since it's typed, not read.
 */
export async function extractMeetingNotes(images: string[], mindmapText: string): Promise<MeetingExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado')
  if (images.length === 0 && !mindmapText.trim()) return { summary: '', tasks: [] }

  const client = new Anthropic({ apiKey })
  const content: Anthropic.ContentBlockParam[] = images
    .slice(0, MAX_IMAGES)
    .map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data } }))

  let instructions = EXTRACTION_INSTRUCTIONS
  if (mindmapText.trim()) {
    instructions += `\n\nContenido de los mapas mentales (texto exacto):\n${mindmapText.trim()}`
  }
  content.push({ type: 'text', text: instructions })

  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  return coerceExtraction(extractJson(text))
}
