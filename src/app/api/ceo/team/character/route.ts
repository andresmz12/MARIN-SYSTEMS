import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ownCompany, teamUser } from '@/lib/team-auth'

// Descripción fija del personaje de los videos con IA (para que sea la misma persona en todos los clips).
export async function GET(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const company = await ownCompany(u.userId, new URL(req.url).searchParams.get('companyId'))
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  const p = await prisma.brandProfile.findFirst({ where: { companyId: company.id }, select: { videoCharacter: true } })
  return NextResponse.json({ text: p?.videoCharacter ?? '' })
}

export async function PUT(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; text?: string }
  const company = await ownCompany(u.userId, b.companyId)
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  const r = await prisma.brandProfile.updateMany({ where: { companyId: company.id }, data: { videoCharacter: (b.text ?? '').trim().slice(0, 1200) || null } })
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Crea primero el perfil de marca' }, { status: 400 })
}
