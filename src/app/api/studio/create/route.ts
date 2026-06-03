import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { randomUUID } from 'crypto'

export const maxDuration = 120

const VOICE_ID   = '9AHim1BsYT5o3WGDtPE0'
const CLAUDE_SYS = `Eres experto en contenido viral para latinos en EE.UU. sobre taxes, LLC, ITIN y servicios financieros. Hablas en español latino conversacional. Responde SOLO JSON válido. Sin markdown. Sin texto extra.`
const DAILY_LIMIT = 20

// ─── Cleanup expired sessions (fire-and-forget) ───────────────
async function cleanupExpired() {
  try {
    const expired = await prisma.studioSession.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true, audioPath: true },
    })
    for (const s of expired) {
      if (s.audioPath && existsSync(s.audioPath)) await unlink(s.audioPath).catch(() => {})
    }
    if (expired.length) {
      await prisma.studioSession.deleteMany({ where: { id: { in: expired.map(s => s.id) } } })
    }
  } catch { /* non-fatal */ }
}

// ─── Claude ──────────────────────────────────────────────────
async function generarMapa(tema: string, redSocial: string, duracion: string): Promise<any> {
  const client = new Anthropic()
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: CLAUDE_SYS,
    messages: [{
      role: 'user',
      content: `Crea un mapa conceptual COMPLETO para un video de ${duracion} segundos sobre: "${tema}"
Para: ${redSocial}

REGLAS DEL TEXTO (crítico):
- SIEMPRE espacios entre palabras. NUNCA juntar: "Nueva Calculadora" NO "NuevaCalculadora"
- Usar \\n para separar en 2 o 3 líneas. Máximo 14 caracteres por línea
- Ejemplos CORRECTOS: "Intereses\\ny Multas", "Formulario\\n1099-K\\nantes del 31", "$600\\npor año\\nen efectivo"
- Ejemplos INCORRECTOS: "Interesesy Multas", "AQuiénAfecta"

REGLAS DEL CONTENIDO (crítico):
- NO usar textos genéricos. SÍ usar datos reales específicos con números, fechas y montos
- MALO: "Qué Es" | BUENO: "Look-Back\\nIRS\\n2025"
- MALO: "A Quién Afecta" | BUENO: "Contratos\\n+2 años\\nretroactivo"
- MALO: "Qué Hacer" | BUENO: "Formulario\\n8697\\nantes abril"
- Cada hijo con un dato concreto: monto ($600), fecha (31 Enero), formulario (1099-K), porcentaje (8%), acción específica
- Usar 3 líneas cuando aporta más datos; 2 líneas cuando el dato es corto
- El mapa debe verse como una guía completa del tema, no un esquema vacío
- 4 ramas SIEMPRE, 2 hijos por rama SIEMPRE
- guion del centro: introducción del tema (3 oraciones explicando por qué importa)
- guion de cada rama: explicación completa de esa categoría (3 oraciones con contexto)
- guion de cada hijo: dato específico del nodo con contexto práctico (2 oraciones)
- El guion explica exactamente lo que dice el texto del nodo, con ejemplos reales

JSON exacto (sin nada más):
{
  "centro": { "id": "centro", "emoji": "🎯", "texto": "Línea1\\nLínea2\\nLínea3", "color": "#hex", "guion": "3 oraciones." },
  "ramas": [
    {
      "id": "r1", "emoji": "📌", "texto": "Línea1\\nLínea2\\nLínea3", "color": "#hex", "guion": "3 oraciones.",
      "hijos": [
        { "id": "h1a", "texto": "Línea1\\nLínea2\\nLínea3", "color": "#hex", "guion": "2 oraciones." },
        { "id": "h1b", "texto": "Línea1\\nLínea2\\nLínea3", "color": "#hex", "guion": "2 oraciones." }
      ]
    }
  ],
  "cta": "Frase call to action. Escríbeme 👇"
}
Incluir las 4 ramas completas con sus 2 hijos cada una. Colores hex vibrantes distintos por rama.`,
    }],
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude no devolvió JSON válido')
  const parsed = JSON.parse(match[0])
  if (!parsed.centro || !Array.isArray(parsed.ramas)) throw new Error('JSON de Claude incompleto')
  return parsed
}

// ─── Guion quality check ─────────────────────────────────────
const GENERIC_PHRASES = [
  'qué es', 'que es', 'aspectos', 'considera', 'factores', 'elementos',
  'puntos clave', 'información', 'concepto', 'introducción', 'overview',
  'a quién', 'a quien', 'beneficios generales', 'ventajas generales',
  'cómo funciona', 'como funciona', 'qué hacer', 'que hacer',
  'notas importantes', 'recuerda que',
]

function hasGenericContent(mapa: any): boolean {
  const allTexts: string[] = []
  if (mapa?.centro?.texto) allTexts.push(mapa.centro.texto)
  for (const rama of mapa?.ramas ?? []) {
    if (rama?.texto) allTexts.push(rama.texto)
    for (const hijo of rama?.hijos ?? []) {
      if (hijo?.texto) allTexts.push(hijo.texto)
    }
  }
  const combined = allTexts.join(' ').toLowerCase()
  return GENERIC_PHRASES.some(p => combined.includes(p))
}

// ─── Build guion ─────────────────────────────────────────────
function construirGuion(mapa: any): string {
  const parts: string[] = []
  if (mapa.centro?.guion)  parts.push(mapa.centro.guion.trim())
  for (const rama of mapa.ramas ?? []) {
    if (rama.guion) parts.push(rama.guion.trim())
    for (const hijo of rama.hijos ?? []) {
      if (hijo.guion) parts.push(hijo.guion.trim())
    }
  }
  if (mapa.cta) parts.push(mapa.cta.trim())
  return parts.join(' ')
}

// ─── Proportional timestamps (0–1); last node always ends at 1 ─
function calcularTimestamps(mapa: any, guionCompleto: string) {
  const totalW = guionCompleto.split(/\s+/).filter(Boolean).length
  const orden: { id: string; guion: string }[] = []
  orden.push({ id: mapa.centro.id ?? 'centro', guion: mapa.centro.guion ?? '' })
  for (const rama of mapa.ramas ?? []) {
    orden.push({ id: rama.id, guion: rama.guion ?? '' })
    for (const hijo of rama.hijos ?? []) {
      orden.push({ id: hijo.id, guion: hijo.guion ?? '' })
    }
  }
  if (mapa.cta) orden.push({ id: 'cta', guion: mapa.cta })

  let acum = 0
  return orden.map((nodo, i) => {
    const w    = nodo.guion.split(/\s+/).filter(Boolean).length
    const prop = w / Math.max(totalW, 1)
    const fin  = i === orden.length - 1 ? 1.0 : acum + prop  // last node always reaches 1.0
    const ts   = { id: nodo.id, inicio: acum, fin }
    acum += prop
    return ts
  })
}

// ─── ElevenLabs with retry ───────────────────────────────────
async function generarAudio(apiKey: string, text: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      )
      if (res.status === 401) throw new Error('API key de ElevenLabs inválida')
      if (res.status === 429) throw new Error('Sin créditos disponibles en ElevenLabs')
      if (res.status === 400) throw new Error('El texto es demasiado largo o tiene caracteres inválidos')
      if (res.status === 503) throw new Error('ElevenLabs está en mantenimiento, intenta en unos minutos')
      if (!res.ok) throw new Error(`ElevenLabs error ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      console.error(`[studio/create] ElevenLabs intento ${attempt}:`, err)
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error('No se pudo generar el audio después de 3 intentos')
}

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY no configurado' }, { status: 500 })

  const { tema, redSocial, duracion } = await req.json() as {
    tema: string; redSocial: string; duracion: string
  }
  if (!tema) return NextResponse.json({ error: 'tema requerido' }, { status: 400 })

  // Rate limit: 20 studio links per user per 24h
  const userId = session.user.id
  const recent = await prisma.studioSession.count({
    where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  if (recent >= DAILY_LIMIT) {
    return NextResponse.json({ error: `Límite diario alcanzado (${DAILY_LIMIT} por día)` }, { status: 429 })
  }

  // Cleanup expired sessions in the background (non-blocking)
  cleanupExpired()

  // Step 1: Claude (up to 3 attempts if generic content detected)
  let mapaJson: any
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      mapaJson = await generarMapa(tema, redSocial ?? 'TikTok', duracion ?? '60s')
      if (!hasGenericContent(mapaJson)) break
      if (attempt === 3) break  // use last attempt even if still generic
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generando mapa' },
      { status: 500 },
    )
  }

  const guionCompleto = construirGuion(mapaJson)
  const timestamps    = calcularTimestamps(mapaJson, guionCompleto)

  // Step 2: ElevenLabs
  let audioBuffer: Buffer
  try {
    audioBuffer = await generarAudio(apiKey, guionCompleto)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error generando audio' },
      { status: 503 },
    )
  }

  // Step 3: Save audio to /tmp, generate token first
  const token     = randomUUID().replace(/-/g, '')
  const audioPath = `/tmp/audio-${token}.mp3`
  await writeFile(audioPath, audioBuffer)

  // Step 4: Save to DB
  await prisma.studioSession.create({
    data: {
      token,
      userId,
      tema,
      redSocial: redSocial ?? 'TikTok',
      duracion:  duracion  ?? '60s',
      mapaJson,
      guion: guionCompleto,
      audioPath,
      timestamps,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? ''
  return NextResponse.json({ url: `${baseUrl}/studio/${token}` })
}
