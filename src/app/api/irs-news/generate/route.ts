import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { callClaude } from '@/lib/ai'
import { datePrefix } from '@/lib/ai-date'

type Platform = 'tiktok' | 'youtube' | 'facebook'

const IRS_NEWS_SYS = `Eres experto en contenido para latinos en EE.UU. sobre impuestos e IRS. Español latino conversacional. Responde SOLO JSON válido. Sin markdown. Sin texto extra.`

function buildPrompt(platform: Platform, title: string, summary: string): string {
  const base = `Noticia del IRS (Servicio de Impuestos Internos de EE.UU.):\nTítulo: ${title}\nResumen: ${summary}\n\n`

  if (platform === 'tiktok') {
    return (
      base +
      `Genera contenido para TikTok / Reels en español para una audiencia hispanohablante en EE.UU. Responde SOLO con JSON válido con esta estructura exacta:
{
  "guion": "guion de 30-45 segundos en español, conversacional y dinámico",
  "puntosClave": ["punto 1", "punto 2", "punto 3"],
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`
    )
  }

  if (platform === 'youtube') {
    return (
      base +
      `Genera contenido para YouTube en español para una audiencia hispanohablante en EE.UU. Responde SOLO con JSON válido con esta estructura exacta:
{
  "titulo": "título llamativo para el video",
  "guion": "guion de 60-90 segundos en español, educativo y claro",
  "descripcion": "descripción completa para la caja de descripción de YouTube",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8"]
}`
    )
  }

  return (
    base +
    `Genera contenido para Facebook en español para una audiencia hispanohablante en EE.UU. Responde SOLO con JSON válido con esta estructura exacta:
{
  "captionCorto": "caption corto de 1-2 oraciones impactantes",
  "postLargo": "post completo listo para copiar y pegar en Facebook, con emojis y llamada a la acción",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"]
}`
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { newsId, platform } = body as { newsId: string; platform: Platform }

  if (!newsId || !['tiktok', 'youtube', 'facebook'].includes(platform)) {
    return NextResponse.json({ error: 'newsId y platform requeridos' }, { status: 400 })
  }

  const news = await prisma.irsNews.findUnique({ where: { id: newsId } })
  if (!news) return NextResponse.json({ error: 'Noticia no encontrada' }, { status: 404 })

  const prompt = buildPrompt(platform, news.title, news.summary)

  const raw = await callClaude({
    model: 'claude-sonnet-4-6',
    system: datePrefix() + IRS_NEWS_SYS,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1024,
  })

  let content: unknown
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    content = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw }
  } catch {
    content = { raw }
  }

  return NextResponse.json({ platform, content })
}
