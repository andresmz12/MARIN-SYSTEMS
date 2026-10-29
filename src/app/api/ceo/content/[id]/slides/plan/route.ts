import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AI_MODEL_SMART, callClaude, extractJson } from '@/lib/ai'
import { parseImageText, parseSlides } from '@/lib/image-prompt'

export const maxDuration = 60

// Convierte un post en el texto de un carrusel: portada, láminas de contenido y cierre.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })

  try {
    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id }, include: { company: { select: { name: true } } } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    const t = parseImageText(post.imageText)
    const prompt = `Convierte este post en el texto de un CARRUSEL de Instagram (varias láminas deslizables) para ${post.company.name}, en español.

POST:
${post.copy}

DATOS A RESPETAR (no inventes otros): ${post.facts.length ? post.facts.join(' | ') : 'ninguno específico'}
${t ? `TITULAR DEL POST: ${t.headline}${t.keyFact ? ` · DATO CLAVE: ${t.keyFact}` : ''}` : ''}

REGLAS:
- De 6 a 8 láminas en total: 1 portada con un gancho fuerte, de 4 a 6 láminas de contenido y 1 lámina final con la acción ("Guarda este post" y una invitación a escribirnos).
- UNA sola idea por lámina. Título corto (máximo 8 palabras) y, si hace falta, un texto de apoyo de máximo 25 palabras.
- Explica cada sigla en español la primera vez que aparece. Incluye al menos una lámina con un ejemplo con números (marcado como ejemplo de referencia) y una con quién califica o quién no.
- Para CADA lámina propone una imagen ("visual"): una escena o ilustración concreta y relevante, en inglés, sin texto escrito (ej: "a restaurant server counting tips at the end of a shift, warm flat illustration"). La portada y la lámina final pueden usar a nuestra vocera (la mujer de la foto de referencia); las demás NO llevan caras, usan escenas, objetos e íconos.
- Vocabulario de latinos en EE.UU.: "impuestos", "preparación de impuestos", "declarar tus impuestos", "contador". NO uses "asesoría fiscal", "Hacienda", "fisco" ni "declaración de la renta".
- Usa SOLO datos del post; no inventes montos, fechas ni requisitos.
- Acentos y signos ¿ ¡ correctos. Nada de texto en inglés salvo nombres oficiales de formularios.

Responde ÚNICAMENTE con este JSON:
{"slides":[{"title":"…","body":"…","visual":"…"}]}`

    const text = await callClaude({ model: AI_MODEL_SMART, messages: [{ role: 'user', content: prompt }], maxTokens: 2400 })
    const parsed = extractJson(text) as { slides?: unknown } | null
    const slides = parseSlides(parsed?.slides)
    if (slides.length < 3) return NextResponse.json({ error: 'La IA no devolvió un carrusel válido, intenta de nuevo' }, { status: 502 })

    // Todas las redes del grupo comparten el mismo carrusel.
    await prisma.generatedPost.updateMany({
      where: post.groupId ? { groupId: post.groupId, userId: session.user.id, status: { notIn: ['published', 'publishing'] } } : { id: post.id },
      data: { slides: slides as never },
    })
    const updated = await prisma.generatedPost.findUnique({ where: { id: post.id }, include: { company: true } })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[slides/plan]', err)
    return NextResponse.json({ error: 'No se pudo armar el carrusel' }, { status: 500 })
  }
}
