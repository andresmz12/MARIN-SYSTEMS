import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AI_MODEL, callClaude, extractJson } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { lintPost } from '@/lib/compliance'
import { parseImageText } from '@/lib/image-prompt'

export const maxDuration = 60

// Reescribe SOLO lo que marcó la revisión de cumplimiento (promesas, ejemplos sin suposición, cifras de millones, etc.),
// sin cambiar los datos. Guarda la versión anterior para poder volver atrás.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
  if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
  if (post.status === 'published' || post.status === 'publishing') return NextResponse.json({ error: 'Este post ya se publicó' }, { status: 400 })

  const imageText = parseImageText(post.imageText)
  const issues = lintPost({ copy: post.copy, imageText })
  if (issues.length === 0) return NextResponse.json({ error: 'No hay nada que corregir' }, { status: 400 })

  const prompt = `Eres el revisor de cumplimiento de una empresa de impuestos y contabilidad para latinos en EE.UU. Corrige ESTE post para que no comprometa a la empresa.

TEXTO DEL POST:
"""${post.copy}"""

TEXTOS DE LA IMAGEN (JSON):
${JSON.stringify(imageText ?? {})}

PROBLEMAS ENCONTRADOS (corrígelos todos):
${issues.map((i, n) => `${n + 1}. [${i.where}] ${i.message}`).join('\n')}

REGLAS:
- Mantén los MISMOS datos, cifras, fechas, formularios y estructura. No agregues datos nuevos ni inventes nada.
- Sin promesas ni garantías: usa "puede", "podría", "hasta". Nada de "reduce tus impuestos", "ahorrarás", "maximizar", "el truco", "gratis".
- Todo ejemplo con números dice su suposición en la misma frase (ej: "con una tasa de impuestos de 25%") y se marca "Ejemplo de referencia".
- Si una cifra es un tope de millones de dólares, quítala de los textos de la imagen y explícala solo en el texto del post.
- El texto del post termina con la línea: "Cifras de referencia; confírmalas en IRS.gov o con un profesional."
- Al menos un punto de la imagen aclara una condición o quién no califica.
- Español simple, con acentos. Mismo tono y mismos emojis.

Responde ÚNICAMENTE con este JSON:
{"copy":"texto corregido completo","imageText":{"headline":"…","subheadline":"…","keyFact":"…","bullets":["…"],"cta":"…","face":${imageText?.face ? 'true' : 'false'}}}`

  let text = ''
  try {
    text = await callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], maxTokens: 2000 })
  } catch (err) {
    return NextResponse.json({ error: `${classifyAiError(err).message} El post quedó como estaba.` }, { status: 502 })
  }
  const parsed = extractJson(text) as { copy?: unknown; imageText?: unknown } | null
  const newCopy = typeof parsed?.copy === 'string' ? parsed.copy.trim() : ''
  if (!parsed || newCopy.length < 40) return NextResponse.json({ error: 'La IA no devolvió una corrección válida. El post quedó como estaba; intenta de nuevo.' }, { status: 502 })
  const newImageText = parseImageText(parsed.imageText) ?? imageText

  const previousVersion = {
    copy: post.copy, hashtags: post.hashtags, cta: post.cta, contentNotes: post.contentNotes, imagePrompt: post.imagePrompt,
    imageText: post.imageText ?? null, facts: post.facts, topic: post.topic, savedAt: new Date().toISOString(),
  }
  const data = {
    previousVersion: previousVersion as never,
    copy: newCopy,
    imageText: (newImageText ?? Prisma.DbNull) as never,
    factCheck: Prisma.DbNull,
    factCheckedAt: null,
  }
  if (post.groupId) {
    await prisma.generatedPost.updateMany({
      where: { groupId: post.groupId, userId: session.user.id, id: { not: post.id }, status: { notIn: ['published', 'publishing'] } },
      data,
    })
  }
  const updated = await prisma.generatedPost.update({ where: { id: post.id }, data, include: { company: true } })
  return NextResponse.json({ post: updated, remaining: lintPost({ copy: newCopy, imageText: newImageText }) })
}
