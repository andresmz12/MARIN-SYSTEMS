import { NextRequest, NextResponse } from 'next/server'
import { asAgent } from '@/lib/agent-job'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AI_MODEL, callClaude, extractJson } from '@/lib/ai'
import { classifyAiError } from '@/lib/ai-health'
import { lintPost } from '@/lib/compliance'
import { parseImageText } from '@/lib/image-prompt'

export const maxDuration = 120

// Reescribe SOLO lo que marcó la revisión de cumplimiento (promesas, ejemplos sin suposición, cifras de millones, etc.),
// sin cambiar los datos. Guarda la versión anterior para poder volver atrás.
async function handlePOST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
  if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
  if (post.status === 'published' || post.status === 'publishing') return NextResponse.json({ error: 'Este post ya se publicó' }, { status: 400 })

  const imageText = parseImageText(post.imageText)
  const issues = lintPost({ copy: post.copy, imageText })
  if (issues.length === 0) return NextResponse.json({ error: 'No hay nada que corregir' }, { status: 400 })

  const buildPrompt = (copy: string, imgText: unknown, list: { where: string; message: string }[]) => `Eres el revisor de cumplimiento de una empresa de impuestos y contabilidad para latinos en EE.UU. Corrige ESTE post para que no comprometa a la empresa.

TEXTO DEL POST:
"""${copy}"""

TEXTOS DE LA IMAGEN (JSON):
${JSON.stringify(imgText ?? {})}

PROBLEMAS ENCONTRADOS (corrígelos todos):
${list.map((i, n) => `${n + 1}. [${i.where}] ${i.message}`).join('\n')}

REGLAS:
- Mantén los MISMOS datos, cifras, fechas, formularios y estructura. No agregues datos nuevos ni inventes nada.
- Sin promesas ni garantías: usa "puede", "podría", "hasta". Nada de "reduce tus impuestos", "ahorrarás", "maximizar", "el truco", "gratis".
- Todo ejemplo con números dice su suposición EN EL MISMO TEXTO (el del post y también el de la imagen, cada uno por separado) con una de estas palabras exactas: "tasa", "suponiendo", "asumiendo", "con un ingreso", "si tu", "si pagas" o "aproximado". Ejemplo: "Ejemplo de referencia: suponiendo una tasa de impuestos de 25%…". Si la imagen menciona un ejemplo con cifras, repite esa suposición también en el texto de la imagen.
- Si una cifra es un tope de millones de dólares, quítala de los textos de la imagen y explícala solo en el texto del post.
- El texto del post termina con la línea: "Cifras de referencia; confírmalas en IRS.gov o con un profesional."
- Al menos un punto de la imagen aclara una condición o quién no califica.
- Español simple, con acentos. Mismo tono y mismos emojis.

Responde ÚNICAMENTE con este JSON:
{"copy":"texto corregido completo","imageText":{"headline":"…","subheadline":"…","keyFact":"…","bullets":["…"],"cta":"…","face":${imageText?.face ? 'true' : 'false'}}}`

  // Hasta 3 intentos: cada uno recibe lo que todavía marca la revisión automática.
  let newCopy = post.copy
  let newImageText = imageText
  let remainingIssues = issues
  let ok = false
  let lastError = ''
  for (let attempt = 0; attempt < 3 && remainingIssues.length > 0; attempt++) {
    let text = ''
    try {
      text = await callClaude({ model: AI_MODEL, messages: [{ role: 'user', content: buildPrompt(newCopy, newImageText, remainingIssues) }], maxTokens: 2000 })
    } catch (err) {
      lastError = `${classifyAiError(err).message}`
      break
    }
    const parsed = extractJson(text) as { copy?: unknown; imageText?: unknown } | null
    const c = typeof parsed?.copy === 'string' ? parsed.copy.trim() : ''
    if (!parsed || c.length < 40) { lastError = 'La IA no devolvió una corrección válida.'; continue }
    newCopy = c
    newImageText = parseImageText(parsed.imageText) ?? newImageText
    ok = true
    remainingIssues = lintPost({ copy: newCopy, imageText: newImageText })
  }
  if (!ok) return NextResponse.json({ error: `${lastError || 'No se pudo corregir.'} El post quedó como estaba; intenta de nuevo.` }, { status: 502 })

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
  return NextResponse.json({ post: updated, remaining: remainingIssues })
}

export const POST = asAgent('felipe', 'Corrigió un post con la revisión de cumplimiento', handlePOST)
