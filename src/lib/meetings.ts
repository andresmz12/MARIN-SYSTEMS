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
1. Un resumen elaborado y bien redactado de TODO lo escrito (varios párrafos si hace falta, en prosa clara) — esto incluye tanto las notas normales como las tareas, todo integrado en el relato de la reunión.
2. Una lista de tareas — pero SOLO cuenta como tarea lo que el usuario marcó explícitamente como tal. Señales de que algo es una tarea:
   - Está numerado o etiquetado como tarea: "Tarea 1)", "Tarea:", "TO DO", "Pendiente:", "Acción:".
   - Tiene una casilla dibujada al lado (☐, un cuadrado vacío, un círculo vacío) — es una lista de chequeo.
   - Empieza con un verbo en infinitivo o imperativo claro de acción a realizar ("Llamar a...", "Enviar...", "Revisar...").
   No conviertas en tarea una nota informativa, una idea, un dato o una observación solo porque suena importante — la mayoría de lo escrito en una reunión son notas, NO tareas. Ante la duda, no la incluyas como tarea (mejor que quede solo en el resumen).

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
