import { AI_BLOCK_TYPES } from './ceo'

/** Model used for lightweight per-block content generation. */
const AI_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export interface BlockContentInput {
  companyName: string
  durationHours: number
  startTime: string
  endTime: string
  ideasInProgress: string[]
  ideasPending: string[]
  defaultBlockType: string
}

export interface BlockContent {
  title: string
  description: string
  blockType: string
  steps: string[]
}

/** Deterministic fallback used when the AI is unavailable or fails. */
function fallbackContent(input: BlockContentInput): BlockContent {
  const inProgress = input.ideasInProgress[0]
  const pending = input.ideasPending[0]
  let title: string
  if (inProgress) title = inProgress.slice(0, 60)
  else if (pending) title = `Desarrollar: ${pending}`.slice(0, 60)
  else title = `${input.companyName}: Operaciones y seguimiento`.slice(0, 60)

  return {
    title,
    description: `Bloque de ${input.durationHours}h enfocado en ${input.companyName}.`,
    blockType: input.defaultBlockType,
    steps: [],
  }
}

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
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function coerce(parsed: unknown, input: BlockContentInput): BlockContent {
  const fb = fallbackContent(input)
  if (typeof parsed !== 'object' || parsed === null) return fb
  const obj = parsed as Record<string, unknown>

  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim().slice(0, 60) : fb.title
  const description = typeof obj.description === 'string' && obj.description.trim() ? obj.description.trim() : fb.description
  const blockType =
    typeof obj.blockType === 'string' && AI_BLOCK_TYPES.includes(obj.blockType) ? obj.blockType : fb.blockType
  const steps = Array.isArray(obj.steps)
    ? obj.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()).slice(0, 6)
    : []

  return { title, description, blockType, steps }
}

/**
 * Generate the title / description / steps for a single company work block.
 * Falls back to deterministic content if `ANTHROPIC_API_KEY` is unset or the call fails,
 * so plan generation never breaks because of the AI layer.
 */
export async function generateBlockContent(input: BlockContentInput): Promise<BlockContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return fallbackContent(input)

  const prompt = `Eres el asistente personal de un CEO colombiano que maneja 6 empresas.
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
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return fallbackContent(input)

    const data: unknown = await res.json()
    const content = (data as { content?: { type: string; text?: string }[] }).content
    const text = content?.find((c) => c.type === 'text')?.text ?? ''
    const parsed = extractJson(text)
    return coerce(parsed, input)
  } catch {
    return fallbackContent(input)
  }
}
