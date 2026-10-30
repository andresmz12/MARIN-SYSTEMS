import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseImageText } from '@/lib/image-prompt'
import { OpenAiImageError, generateImage, openaiImageReady, type RefImage } from '@/lib/openai-image'
import { storeGroupImage } from '@/lib/post-image'

export const maxDuration = 180

// Genera la imagen del post con OpenAI (solo posts de una imagen; los carruseles se hacen en Gemini).
// Manda como referencia el logo y, si el post lleva la cara de la marca, la foto de la vocera.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (!openaiImageReady()) return NextResponse.json({ error: 'Falta la clave OPENAI_API_KEY en Railway.' }, { status: 400 })
    const { prompt, mode } = (await req.json().catch(() => ({}))) as { prompt?: string; mode?: string }
    if (!prompt || prompt.trim().length < 40) return NextResponse.json({ error: 'Falta el prompt de la imagen' }, { status: 400 })

    const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id } })
    if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
    if (post.status === 'published' || post.status === 'publishing') return NextResponse.json({ error: 'Este post ya se publicó' }, { status: 400 })
    if (Array.isArray(post.slides) && post.slides.length > 0) {
      return NextResponse.json({ error: 'Los carruseles se hacen en Gemini: copia el prompt del carrusel y sube las láminas.' }, { status: 400 })
    }

    const wantsFace = !!parseImageText(post.imageText)?.face
    const assets = await prisma.brandAsset.findMany({ where: { companyId: post.companyId, kind: wantsFace ? { in: ['logo', 'face'] } : 'logo' } })
    const refs: RefImage[] = assets
      .sort((a, b) => (a.kind === 'face' ? -1 : 1) - (b.kind === 'face' ? -1 : 1))
      .map((a) => ({ data: Buffer.from(a.data), mime: a.mime, name: `${a.kind}.${a.mime.split('/')[1] ?? 'png'}` }))

    const extra = [
      refs.some((r) => r.name.startsWith('face')) ? 'The FIRST attached image is the brand spokeswoman: keep her face and features identical.' : '',
      refs.some((r) => r.name.startsWith('logo')) ? 'The attached logo image is the official brand logo: reproduce it exactly, do not redraw or alter it.' : '',
    ].filter(Boolean).join(' ')

    const png = await generateImage(extra ? `${prompt.trim()}\n\n${extra}` : prompt.trim(), refs)
    const result = await storeGroupImage(post, session.user.id, png, mode === 'crop' ? 'crop' : 'complete')
    return NextResponse.json({ ...result, usedRefs: refs.map((r) => r.name.split('.')[0]) })
  } catch (err) {
    if (err instanceof OpenAiImageError) return NextResponse.json({ error: err.message }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 })
    console.error('[generate-image]', err)
    return NextResponse.json({ error: 'No se pudo generar la imagen' }, { status: 500 })
  }
}
