import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BLOG_TOPICS } from '@/lib/blog-topics-data'
import { teamUser } from '@/lib/team-auth'

// Banco de temas del blog (Luis): ver la cola, cargar los temas del dueño y saltar o recuperar uno.
async function blogCompany(userId: string) {
  const name = process.env.BLOG_COMPANY_NAME || 'Reports Systems'
  return prisma.cEOCompany.findFirst({ where: { userId, name: { contains: name, mode: 'insensitive' } }, select: { id: true } })
}

export async function GET() {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const company = await blogCompany(u.userId)
  if (!company) return NextResponse.json({ ready: false, total: 0, pending: 0, used: 0, skipped: 0, needsInput: [], next: [] })
  const rows = await prisma.blogTopic.findMany({ where: { companyId: company.id }, orderBy: { priority: 'asc' } })
  const pendingAuto = rows.filter((r) => r.status === 'pending' && r.kind !== 'needs_input')
  return NextResponse.json({
    ready: true,
    total: rows.length,
    pending: pendingAuto.length,
    used: rows.filter((r) => r.status === 'used').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    next: pendingAuto.slice(0, 6).map((r) => ({ id: r.id, title: r.title, category: r.category, kind: r.kind })),
    needsInput: rows.filter((r) => r.kind === 'needs_input' && r.status === 'pending').map((r) => ({ id: r.id, title: r.title })),
    recent: rows.filter((r) => r.status === 'used').sort((a, b) => (b.usedAt?.getTime() ?? 0) - (a.usedAt?.getTime() ?? 0)).slice(0, 4).map((r) => ({ title: r.title, usedAt: r.usedAt })),
  })
}

// Carga (o completa) el banco con los temas del dueño. No duplica ni toca los que ya existen.
export async function POST() {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const company = await blogCompany(u.userId)
  if (!company) return NextResponse.json({ error: 'Primero guarda el perfil del blog (crea la empresa).' }, { status: 400 })
  const r = await prisma.blogTopic.createMany({ data: BLOG_TOPICS.map((t) => ({ ...t, companyId: company.id })), skipDuplicates: true })
  return NextResponse.json({ ok: true, added: r.count, total: BLOG_TOPICS.length })
}

export async function PATCH(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const company = await blogCompany(u.userId)
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string }
  if (!company || !b.id || !['pending', 'skipped'].includes(b.status ?? '')) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 })
  const r = await prisma.blogTopic.updateMany({ where: { id: b.id, companyId: company.id }, data: { status: b.status } })
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No encontrado' }, { status: 404 })
}
