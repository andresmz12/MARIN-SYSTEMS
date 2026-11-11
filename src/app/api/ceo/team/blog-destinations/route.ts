import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { blogEnvName, resolveBlogTarget } from '@/lib/blog-api'
import { teamUser } from '@/lib/team-auth'

// Blogs de destino: a qué blog va lo que publicamos y de qué empresa se copia ("espejo").
export async function GET() {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const companies = await prisma.cEOCompany.findMany({ where: { userId: u.userId, isActive: true }, orderBy: { name: 'asc' } })
  const profiles = await prisma.brandProfile.findMany({ where: { companyId: { in: companies.map((c) => c.id) } } })
  const mirrored = await prisma.blogMirror.groupBy({ by: ['targetCompanyId'], _count: { _all: true } })
  return NextResponse.json({
    companies: companies.map((c) => {
      const p = profiles.find((x) => x.companyId === c.id) ?? null
      return {
        id: c.id,
        name: c.name,
        blogApiUrl: p?.blogApiUrl ?? (resolveBlogTarget(c, p)?.baseUrl ?? ''),
        envVar: blogEnvName(c.name),
        hasKey: !!resolveBlogTarget(c, p),
        mirrorFrom: p?.blogMirrorFrom ?? '',
        weekly: !!p?.blogEnabled,
        sent: mirrored.find((m) => m.targetCompanyId === c.id)?._count._all ?? 0,
      }
    }),
  })
}

export async function PUT(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; blogApiUrl?: string; mirrorFrom?: string | null }
  const company = b.companyId ? await prisma.cEOCompany.findFirst({ where: { id: b.companyId, userId: u.userId } }) : null
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  const url = (b.blogApiUrl ?? '').trim().replace(/\/$/, '')
  if (url && !/^(https:\/\/[^\s/]+|http:\/\/localhost(:\d+)?)$/i.test(url)) return NextResponse.json({ error: 'La dirección debe ser algo como https://miblog.com (sin ruta al final)' }, { status: 400 })
  if (b.mirrorFrom) {
    const src = await prisma.cEOCompany.findFirst({ where: { id: b.mirrorFrom, userId: u.userId }, select: { id: true } })
    // Puede ser otra empresa o la misma (lo que publica ISM va al blog de ISM).
    if (!src) return NextResponse.json({ error: 'La empresa de origen no es válida' }, { status: 400 })
  }
  const existing = await prisma.brandProfile.findFirst({ where: { companyId: company.id } })
  const mirrorFrom = b.mirrorFrom || null
  const since = mirrorFrom && mirrorFrom !== existing?.blogMirrorFrom ? new Date() : existing?.blogMirrorSince ?? null
  const data = { blogApiUrl: url || null, blogMirrorFrom: mirrorFrom, blogMirrorSince: mirrorFrom ? since : null }
  if (existing) await prisma.brandProfile.update({ where: { id: existing.id }, data })
  else await prisma.brandProfile.create({ data: { userId: u.userId, companyId: company.id, tone: 'Cercano y claro', targetAudience: 'Por definir', contentPillars: [] as never, autoEnabled: false, newsEnabled: false, ...data } })
  return NextResponse.json({ ok: true })
}
