import Anthropic from '@anthropic-ai/sdk'
import { extractJson } from './ai'

const VISION_MODEL = 'claude-sonnet-5'

export interface MeetingExtraction {
  summary: string
  tasks: string[]
}

function coerceExtraction(parsed: unknown): MeetingExtraction {
  if (typeof parsed !== 'object' || parsed === null) return { summary: '', tasks: [] }
  const obj = parsed as Record<string, unknown>
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  const tasks = Array.isArray(obj.tasks)
    ? obj.tasks.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()).slice(0, 20)
    : []
  return { summary, tasks }
}

/**
 * Reads a PNG snapshot of handwritten meeting notes (base64, no data: prefix)
 * and returns an elaborated summary plus extracted action items. Vision quality
 * depends entirely on handwriting legibility — this is the tradeoff of ink notes
 * over typed text.
 */
export async function extractMeetingNotes(imageBase64: string): Promise<MeetingExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurado')

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
          {
            type: 'text',
            text: `Esta imagen son notas manuscritas de una reunión de negocios (en español). Lee la escritura a mano lo mejor que puedas.
Genera:
1. Un resumen elaborado y bien redactado de lo discutido (varios párrafos si hace falta, en prosa clara, no solo una lista de lo que ves escrito).
2. Una lista de tareas/acciones concretas mencionadas o implícitas en las notas (asigna un verbo de acción a cada una).

Si la letra es ilegible en partes, ignora esas partes en vez de inventar contenido.

Responde ÚNICAMENTE con este JSON:
{"summary": "resumen elaborado aquí", "tasks": ["tarea 1", "tarea 2"]}`,
          },
        ],
      },
    ],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

  return coerceExtraction(extractJson(text))
}
