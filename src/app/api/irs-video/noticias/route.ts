import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export interface MapaHijo {
  id: string
  texto: string
  color: string
  explicacion: string
}
export interface MapaRama {
  id: string
  emoji: string
  texto: string
  color: string
  explicacion: string
  hijos: MapaHijo[]
}
export interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string; explicacion: string }
  ramas: MapaRama[]
}

/* GET — returns recent IRS news from DB */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const news = await prisma.irsNews.findMany({ orderBy: { publishedAt: 'desc' }, take: 30 })
    return NextResponse.json(news)
  } catch {
    return NextResponse.json({ error: 'Error al obtener noticias' }, { status: 500 })
  }
}

/* POST — generate educational mind map + narration script */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, summary, spanishSummary } = await req.json() as {
    title: string
    summary: string
    spanishSummary?: string
  }
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })

  const client = new Anthropic()

  const context = spanishSummary || summary || ''

  const prompt = `Eres un educador financiero que crea contenido para la comunidad hispana en EE.UU. Tu objetivo es explicar temas del IRS de forma clara, útil y memorable — como si fuera una clase sencilla para alguien que nunca ha entendido de impuestos.

A partir de esta noticia del IRS, genera un mapa mental educativo con explicaciones detalladas.

ESTRUCTURA JSON (5 ramas, 3 hijos por rama, con "explicacion" en cada elemento):

{
  "centro": {
    "id": "c",
    "emoji": "🏛",
    "texto": "TÍTULO CORTO (máx 4 palabras)",
    "color": "#1e3a5f",
    "explicacion": "2-3 oraciones que presentan el tema. ¿Qué es? ¿A quién afecta? ¿Por qué importa ahora? Usa lenguaje de conversación, no técnico."
  },
  "ramas": [
    {
      "id": "r1",
      "emoji": "📌",
      "texto": "Qué es (3-4 palabras)",
      "color": "#dc2626",
      "explicacion": "2-3 oraciones que explican esta categoría con un ejemplo concreto. Responde: ¿qué significa esto para alguien normal?",
      "hijos": [
        { "id": "r1h1", "texto": "etiqueta corta (4-6 palabras)", "color": "#fca5a5", "explicacion": "1-2 oraciones específicas sobre este punto. Incluye cifras, fechas o ejemplos reales cuando sea posible." },
        { "id": "r1h2", "texto": "etiqueta corta (4-6 palabras)", "color": "#fca5a5", "explicacion": "1-2 oraciones específicas sobre este punto." },
        { "id": "r1h3", "texto": "etiqueta corta (4-6 palabras)", "color": "#fca5a5", "explicacion": "1-2 oraciones específicas sobre este punto." }
      ]
    },
    {
      "id": "r2",
      "emoji": "💡",
      "texto": "Cómo funciona (3-4 palabras)",
      "color": "#2563eb",
      "explicacion": "2-3 oraciones explicando el mecanismo. Usa una analogía cotidiana si ayuda.",
      "hijos": [
        { "id": "r2h1", "texto": "etiqueta corta", "color": "#93c5fd", "explicacion": "1-2 oraciones específicas." },
        { "id": "r2h2", "texto": "etiqueta corta", "color": "#93c5fd", "explicacion": "1-2 oraciones específicas." },
        { "id": "r2h3", "texto": "etiqueta corta", "color": "#93c5fd", "explicacion": "1-2 oraciones específicas." }
      ]
    },
    {
      "id": "r3",
      "emoji": "✅",
      "texto": "Qué debes hacer (3-4 palabras)",
      "color": "#16a34a",
      "explicacion": "2-3 oraciones con los pasos concretos que debe tomar el contribuyente. Sé específico y práctico.",
      "hijos": [
        { "id": "r3h1", "texto": "etiqueta corta", "color": "#86efac", "explicacion": "1-2 oraciones de acción concreta." },
        { "id": "r3h2", "texto": "etiqueta corta", "color": "#86efac", "explicacion": "1-2 oraciones de acción concreta." },
        { "id": "r3h3", "texto": "etiqueta corta", "color": "#86efac", "explicacion": "1-2 oraciones de acción concreta." }
      ]
    },
    {
      "id": "r4",
      "emoji": "📅",
      "texto": "Fechas y montos (3-4 palabras)",
      "color": "#d97706",
      "explicacion": "2-3 oraciones sobre los números y fechas clave. Di exactamente cuánto y cuándo.",
      "hijos": [
        { "id": "r4h1", "texto": "etiqueta corta", "color": "#fcd34d", "explicacion": "1-2 oraciones con dato específico." },
        { "id": "r4h2", "texto": "etiqueta corta", "color": "#fcd34d", "explicacion": "1-2 oraciones con dato específico." },
        { "id": "r4h3", "texto": "etiqueta corta", "color": "#fcd34d", "explicacion": "1-2 oraciones con dato específico." }
      ]
    },
    {
      "id": "r5",
      "emoji": "⚠️",
      "texto": "Errores que evitar (3-4 palabras)",
      "color": "#7c3aed",
      "explicacion": "2-3 oraciones sobre los errores más comunes y sus consecuencias. Que la gente diga: 'uy, casi cometo ese error'.",
      "hijos": [
        { "id": "r5h1", "texto": "etiqueta corta", "color": "#c4b5fd", "explicacion": "1-2 oraciones sobre este error específico y su consecuencia." },
        { "id": "r5h2", "texto": "etiqueta corta", "color": "#c4b5fd", "explicacion": "1-2 oraciones sobre este error específico." },
        { "id": "r5h3", "texto": "etiqueta corta", "color": "#c4b5fd", "explicacion": "1-2 oraciones sobre este error específico." }
      ]
    }
  ]
}

REGLAS para las explicaciones:
- Lenguaje de conversación, como hablarle a un amigo
- Sin jerga técnica — si usas un término técnico, explícalo inmediatamente
- Incluye ejemplos reales: "Por ejemplo, si eres plomero independiente..."
- Incluye cifras concretas cuando las haya: "$500 de multa", "15 de abril", "30 días"
- Cada explicación debe responder: "¿esto a mí qué me importa?"

NOTICIA:
Título: ${title}
${context ? `Contexto: ${context}` : ''}

También genera un guion narrado de 60-75 segundos en español latino conversacional. El guion DEBE tener estos marcadores exactos al inicio de cada sección (los usamos para sincronizar el mapa):

[INTRO] gancho impactante (1-2 oraciones)
[R1] sección sobre qué es / a quién aplica
[R2] sección sobre cómo funciona
[R3] sección sobre qué debe hacer el contribuyente
[R4] sección sobre fechas y montos
[R5] sección sobre errores que evitar
[CTA] llamada a la acción final

Reglas del guion:
- Cada sección [R1]-[R5]: 2-3 oraciones con datos concretos
- Tono: amigable, como hablarle a un amigo, no como un anuncio
- Sin muletillas, sin "básicamente", sin "en resumen"
- Total: 60-75 segundos cuando se lee en voz alta

Responde SOLO con JSON válido (sin markdown):
{ "mapaJson": {...}, "guionCompleto": "..." }`

  let raw: string
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })
    raw = message.content[0].type === 'text' ? message.content[0].text : ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Error al llamar a la IA: ${msg}` }, { status: 500 })
  }

  let result: { mapaJson: MapaJson; guionCompleto: string }
  try {
    const match = raw.match(/\{[\s\S]*\}/)
    result = match ? JSON.parse(match[0]) : { mapaJson: null, guionCompleto: raw }
  } catch {
    return NextResponse.json({ error: 'Error al parsear respuesta de IA', raw }, { status: 500 })
  }

  // Save to history (non-fatal)
  try {
    await prisma.irsVideoContent.create({
      data: {
        titulo: title.slice(0, 200),
        guionCompleto: result.guionCompleto,
        mapaJson: result.mapaJson as object,
        publishedAt: new Date(),
      },
    })
  } catch { /* ignore */ }

  return NextResponse.json(result)
}
