import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { importBlogArticles, listQueue, sendNextArticle } from '@/lib/blog-queue'
import { teamUser } from '@/lib/team-auth'

export const maxDuration = 120

// Cola de artículos del blog que el dueño escribe con otra IA: importar, ver, mandar ahora y quitar.
async function blogCompanyId(userId: string, given?: string | null) {
  if (given) return (await prisma.cEOCompany.findFirst({ where: { id: given, userId }, select: { id: true } }))?.id ?? null
  const p = await prisma.brandProfile.findFirst({ where: { userId, blogEnabled: true }, select: { companyId: true } })
  if (p) return p.companyId
  const name = process.env.BLOG_COMPANY_NAME || 'Reports Systems'
  return (await prisma.cEOCompany.findFirst({ where: { userId, name: { contains: name, mode: 'insensitive' } }, select: { id: true } }))?.id ?? null
}

export async function GET(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const companyId = await blogCompanyId(u.userId, new URL(req.url).searchParams.get('companyId'))
  if (!companyId) return NextResponse.json({ ready: false, items: [] })
  return NextResponse.json({ ready: true, items: await listQueue(companyId) })
}

export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; text?: string }
  const companyId = await blogCompanyId(u.userId, b.companyId)
  if (!companyId) return NextResponse.json({ error: 'Primero guarda el perfil del blog.' }, { status: 400 })
  const text = (b.text ?? '').slice(0, 600_000)
  if (text.trim().length < 50) return NextResponse.json({ error: 'Pega los artículos en el cuadro.' }, { status: 400 })
  return NextResponse.json(await importBlogArticles(companyId, text))
}

// action: 'send' (mandar ahora ese artículo) | 'skip' | 'ready' (recuperar) | 'delete'
export async function PATCH(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; key?: string; action?: string }
  const companyId = await blogCompanyId(u.userId, b.companyId)
  if (!companyId || !b.key) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
  if (b.action === 'send') {
    const r = await sendNextArticle(companyId, b.key)
    return NextResponse.json(r, { status: r.ok ? 200 : 502 })
  }
  if (b.action === 'delete') { await prisma.blogArticle.deleteMany({ where: { companyId, translationKey: b.key, status: { not: 'sent' } } }); return NextResponse.json({ ok: true }) }
  if (b.action === 'skip' || b.action === 'ready') {
    await prisma.blogArticle.updateMany({ where: { companyId, translationKey: b.key, status: { not: 'sent' } }, data: { status: b.action === 'skip' ? 'skipped' : 'ready' } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
