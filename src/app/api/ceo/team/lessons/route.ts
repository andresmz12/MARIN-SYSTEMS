import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ownCompany, teamUser } from '@/lib/team-auth'

export async function POST(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; text?: string }
  const company = await ownCompany(u.userId, b.companyId)
  const text = b.text?.trim().slice(0, 300)
  if (!company || !text || text.length < 5) return NextResponse.json({ error: 'Escribe la regla (mínimo 5 letras)' }, { status: 400 })
  return NextResponse.json(await prisma.agentLesson.create({ data: { userId: u.userId, companyId: company.id, text } }))
}

export async function PATCH(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { id?: string; active?: boolean; text?: string }
  if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const data: { active?: boolean; text?: string } = {}
  if (typeof b.active === 'boolean') data.active = b.active
  if (b.text?.trim()) data.text = b.text.trim().slice(0, 300)
  const r = await prisma.agentLesson.updateMany({ where: { id: b.id, userId: u.userId }, data })
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No encontrada' }, { status: 404 })
}

export async function DELETE(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  await prisma.agentLesson.deleteMany({ where: { id, userId: u.userId } })
  return NextResponse.json({ ok: true })
}
