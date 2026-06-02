import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

function extractArticleDate(html: string): Date | null {
  // <time datetime="2026-06-04"> or <time datetime="2026-06-04T...">
  const timeMatch = html.match(/<time[^>]+datetime="(\d{4}-\d{2}-\d{2})[^"]*"/)
  if (timeMatch) {
    const d = new Date(timeMatch[1] + 'T12:00:00Z')
    if (!isNaN(d.getTime())) return d
  }
  // "June 4, 2026" style text near top of article
  const textMatch = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/)
  if (textMatch) {
    const d = new Date(textMatch[0])
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) return d
  }
  return null
}

function extractArticleText(html: string): string {
  // Remove scripts, styles, nav, header, footer
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
  // Strip remaining tags and decode entities
  const text = cleaned
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Return first 3000 chars — enough for Claude to summarize
  return text.slice(0, 3000)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const article = await prisma.irsNews.findUnique({ where: { id } })
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Return cached enrichment if available
  if (article.spanishSummary) return NextResponse.json(article)

  // Fetch the IRS article page
  let html = ''
  try {
    const res = await fetch(article.url, { headers: BROWSER_HEADERS, next: { revalidate: 0 } })
    if (res.ok) html = await res.text()
  } catch { /* ignore — will use title only */ }

  // Extract real publication date
  let publishedAt = article.publishedAt
  if (html) {
    const realDate = extractArticleDate(html)
    if (realDate) publishedAt = realDate
  }

  // Extract article text for summarization
  const articleText = html ? extractArticleText(html) : article.title

  // Generate Spanish summary with Claude
  let spanishSummary = ''
  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Eres un experto en impuestos para latinos en EE.UU. Resume esta noticia del IRS en español en 3-4 oraciones claras y directas. Explica qué significa para los contribuyentes y si hay alguna acción que deban tomar. Sin tecnicismos innecesarios.

Título: ${article.title}
Contenido: ${articleText}

Responde SOLO con el resumen en español, sin introducción ni formato especial.`,
      }],
    })
    spanishSummary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  } catch {
    spanishSummary = `Noticia del IRS: ${article.title}. Visita el enlace original para más detalles.`
  }

  // Save enriched data
  const updated = await prisma.irsNews.update({
    where: { id },
    data: { spanishSummary, publishedAt },
  })

  return NextResponse.json(updated)
}
