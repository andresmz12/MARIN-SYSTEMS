import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'

export const maxDuration = 60

// Regenera copy, hashtags, CTA e imagePrompt de un post, opcionalmente guiado por
// una nota del dueño ("más corto", "menos formal", ...). El post vuelve a revisión.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { note } = (await req.json().catch(() => ({}))) as { note?: string }

    const post = await prisma.generatedPost.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: { company: true, brandProfile: true },
    })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
    if (post.status === 'published') {
      return NextResponse.json({ error: 'Un post publicado no se puede regenerar' }, { status: 400 })
    }

    const profile = post.brandProfile
    const guidance = note?.trim()
      ? `Reescribe este post: "${post.topic}". Ajuste pedido por el dueño: ${note.trim().slice(0, 300)}.`
      : `Reescribe este post con un enfoque distinto sobre: "${post.topic}".`

    const generated = await generateMarketingContent({
      companyName: post.company.name,
      platform: post.platform,
      contentType: post.contentType,
      topic: guidance,
      tone: profile.tone,
      targetAudience: profile.targetAudience,
      contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
      voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
      forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
    })

    const updated = await prisma.generatedPost.update({
      where: { id: post.id },
      data: {
        copy: generated.copy,
        hashtags: generated.hashtags,
        cta: generated.cta,
        contentNotes: generated.contentNotes,
        imagePrompt: generated.imagePrompt,
        status: 'pending_review',
        reviewNote: null,
      },
      include: { company: true },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al regenerar el contenido' }, { status: 500 })
  }
}
