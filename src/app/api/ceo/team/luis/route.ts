import { NextRequest, NextResponse } from 'next/server'
import { writeBlogArticle } from '@/lib/blog-writer'
import { blogConfigured } from '@/lib/blog-api'
import { teamUser } from '@/lib/team-auth'

export const maxDuration = 300

// Estado de la conexión del blog.
export async function GET() {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  return NextResponse.json({ configured: blogConfigured(), url: process.env.BLOG_API_URL || 'https://reportssystems.com', company: process.env.BLOG_COMPANY_NAME || 'Reports Systems' })
}

// Luis escribe ahora un artículo (con tema opcional) y lo manda como borrador.
export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { topic?: string }
  const r = await writeBlogArticle({ topic: b.topic?.slice(0, 200) })
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
