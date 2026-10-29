import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'
import { recentFeedback, referenceLines } from '@/lib/auto-content'
import { imagePlatformOf } from '@/lib/image-prompt'

export const maxDuration = 60

// Regenera copy, hashtags, CTA e imagePrompt de un post, opcionalmente guiado por
// una nota del dueño ("más corto", "menos formal", ...). El post vuelve a revisión.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { note, only } = (await req.json().catch(() => ({}))) as { note?: string; only?: 'image' }

    const post = await prisma.generatedPost.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: { company: true, brandProfile: true },
    })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
    if (post.status === 'published') {
      return NextResponse.json({ error: 'Un post publicado no se puede regenerar' }, { status: 400 })
    }

    const profile = post.brandProfile
    const imageOnly = only === 'image'
    const guidance = imageOnly
      ? `Este post YA está escrito y aprobado en su contenido. Mantén exactamente los mismos datos y el mismo tema: "${post.topic}". Texto del post: "${post.copy.slice(0, 900)}".${note?.trim() ? ` Ajuste pedido para la imagen: ${note.trim().slice(0, 300)}.` : ''} Solo necesito una propuesta distinta para la imagen (escena y textos de la imagen).`
      : note?.trim()
      ? `Reescribe este post: "${post.topic}". Ajuste pedido por el dueño: ${note.trim().slice(0, 300)}.`
      : `Reescribe este post con un enfoque distinto sobre: "${post.topic}".`

    const references = referenceLines(profile.references)
    const feedback = await recentFeedback(post.companyId)

    const generated = await generateMarketingContent({
      companyName: post.company.name,
      platform: imagePlatformOf(post),
      contentType: post.contentType,
      topic: post.sourceUrl ? `${guidance} Es una noticia oficial: ${post.sourceUrl}. Completa los detalles con la fuente oficial; no inventes datos.` : guidance,
      research: true,
      tone: profile.tone,
      targetAudience: profile.targetAudience,
      contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
      references: references.length > 0 ? references : undefined,
      feedback: feedback.length > 0 ? feedback : undefined,
      voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
      forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
    })

    // Si la IA falló, generateMarketingContent devuelve un texto de relleno:
    // nunca debe pisar el post real.
    if (generated.copy.includes('[Contenido de ')) {
      return NextResponse.json(
        { error: `${generated.failure?.message ?? 'La IA no devolvió contenido válido.'} Tu post quedó como estaba.`, kind: generated.failure?.kind ?? 'other' },
        { status: 502 },
      )
    }

    if (imageOnly) {
      const imgData = {
        imagePrompt: generated.imagePrompt,
        imageText: (generated.imageText ?? undefined) as never,
      }
      if (post.groupId) {
        await prisma.generatedPost.updateMany({
          where: { groupId: post.groupId, userId: session.user.id, id: { not: post.id }, status: { notIn: ['published', 'publishing'] } },
          data: imgData,
        })
      }
      const updated = await prisma.generatedPost.update({ where: { id: post.id }, data: imgData, include: { company: true } })
      return NextResponse.json(updated)
    }

    // Guarda lo que había para poder volver atrás ("Volver a la versión anterior").
    const previousVersion = {
      copy: post.copy,
      hashtags: post.hashtags,
      cta: post.cta,
      contentNotes: post.contentNotes,
      imagePrompt: post.imagePrompt,
      imageText: post.imageText ?? null,
      facts: post.facts,
      topic: post.topic,
      savedAt: new Date().toISOString(),
    }

    const data = {
      previousVersion: previousVersion as never,
      copy: generated.copy,
      hashtags: generated.hashtags,
      cta: generated.cta,
      contentNotes: generated.contentNotes,
      imagePrompt: generated.imagePrompt,
      imageText: (generated.imageText ?? undefined) as never,
      facts: generated.facts,
      status: 'pending_review',
      reviewNote: null,
      // El contenido cambió: la verificación anterior ya no vale.
      factCheck: Prisma.DbNull,
      factCheckedAt: null,
    }
    if (post.groupId) {
      await prisma.generatedPost.updateMany({
        where: { groupId: post.groupId, userId: session.user.id, id: { not: post.id }, status: { notIn: ['published', 'publishing'] } },
        data,
      })
    }
    const updated = await prisma.generatedPost.update({
      where: { id: post.id },
      data,
      include: { company: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al regenerar el contenido' }, { status: 500 })
  }
}
