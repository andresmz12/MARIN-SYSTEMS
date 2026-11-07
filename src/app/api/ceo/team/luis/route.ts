import { NextRequest, NextResponse } from 'next/server'
import { listBlogCompanies, writeBlogArticle } from '@/lib/blog-writer'
import { teamUser } from '@/lib/team-auth'

export const maxDuration = 300

// Empresas con blog y si su conexión está lista.
export async function GET() {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  return NextResponse.json({ companies: await listBlogCompanies() })
}

// Luis escribe ahora un artículo para una empresa (con tema opcional) y lo manda como borrador.
export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; topic?: string }
  const companies = await listBlogCompanies()
  const companyId = b.companyId ?? companies[0]?.id
  if (!companyId) return NextResponse.json({ ok: false, error: 'Todavía no hay una empresa con blog. Guarda primero el perfil del blog.' }, { status: 400 })
  const r = await writeBlogArticle({ companyId, topic: b.topic?.slice(0, 200) })
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
