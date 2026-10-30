import { NextRequest, NextResponse } from 'next/server'
import { asAgent } from '@/lib/agent-job'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { factCheckGroup } from '@/lib/auto-content'
import { factCheckPost } from '@/lib/agents-ai'
import { knowledgeFor } from '@/lib/knowledge'
import { parseImageText } from '@/lib/image-prompt'

export const maxDuration = 120

// Verifica los datos de un post (y de todas sus redes) a petición del dueño.
async function handlePOST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })

  try {
    const post = await prisma.generatedPost.findFirst({
      where: { id: params.id, userId: session.user.id },
      include: { company: { select: { name: true } } },
    })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })

    if (post.groupId) {
      await factCheckGroup(post.groupId)
    } else {
      const result = await factCheckPost({
        companyName: post.company.name,
        copy: post.copy,
        facts: post.facts,
        imageHeadline: parseImageText(post.imageText)?.headline,
        sourceUrl: post.sourceUrl,
        library: await knowledgeFor(post.userId, post.companyId, `${post.topic} ${post.copy}`),
      })
      if (result) await prisma.generatedPost.update({ where: { id: post.id }, data: { factCheck: result as never, factCheckedAt: new Date() } })
    }
    const updated = await prisma.generatedPost.findUnique({ where: { id: post.id }, select: { factCheck: true, factCheckedAt: true } })
    if (!updated?.factCheck) return NextResponse.json({ error: 'La verificación no devolvió resultado, inténtalo de nuevo' }, { status: 502 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al verificar los datos' }, { status: 500 })
  }
}

export const POST = asAgent('felipe', 'Verificó los datos de un post', handlePOST)
