import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BLOG_PROFILE_DEFAULT as D } from '@/lib/blog-profile'
import { teamUser } from '@/lib/team-auth'

// Perfil de la empresa del blog (la que guía a Luis). GET devuelve lo guardado o los valores sugeridos;
// PUT crea la empresa y su perfil si no existen, o los actualiza. El piloto automático de redes queda APAGADO para ella.
const blogCompanyName = () => process.env.BLOG_COMPANY_NAME || D.name

export async function GET() {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const company = await prisma.cEOCompany.findFirst({ where: { userId: u.userId, name: { contains: blogCompanyName(), mode: 'insensitive' } } })
  const p = company ? await prisma.brandProfile.findFirst({ where: { companyId: company.id } }) : null
  const pillars = Array.isArray(p?.contentPillars) ? (p!.contentPillars as string[]) : []
  return NextResponse.json({
    exists: !!p,
    name: company?.name ?? D.name,
    website: p?.website ?? D.website,
    tone: p?.tone ?? D.tone,
    audience: p?.targetAudience ?? D.audience,
    topics: pillars.length ? pillars : [...D.topics],
    rules: p?.blogRules ?? D.rules,
    cta: p?.blogCta ?? D.cta,
  })
}

export async function PUT(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { website?: string; tone?: string; audience?: string; topics?: string[]; rules?: string; cta?: string }
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const tone = clean(b.tone, 400), audience = clean(b.audience, 400), rules = clean(b.rules, 1500), cta = clean(b.cta, 400), website = clean(b.website, 200)
  const topics = (Array.isArray(b.topics) ? b.topics : []).map((t) => clean(t, 120)).filter(Boolean).slice(0, 20)
  if (!tone || !audience || topics.length === 0) return NextResponse.json({ error: 'Faltan el tono, el público o los temas' }, { status: 400 })
  if (website && !/^https:\/\//i.test(website)) return NextResponse.json({ error: 'La web debe empezar con https://' }, { status: 400 })

  const name = blogCompanyName()
  let company = await prisma.cEOCompany.findFirst({ where: { userId: u.userId, name: { contains: name, mode: 'insensitive' } } })
  if (!company) company = await prisma.cEOCompany.create({ data: { userId: u.userId, name, emoji: '📊', country: ['US'] } })
  const existing = await prisma.brandProfile.findFirst({ where: { companyId: company.id } })
  const data = { tone, targetAudience: audience, contentPillars: topics as never, website: website || null, blogRules: rules || null, blogCta: cta || null, blogEnabled: true }
  if (existing) await prisma.brandProfile.update({ where: { id: existing.id }, data })
  else await prisma.brandProfile.create({ data: { userId: u.userId, companyId: company.id, autoEnabled: false, newsEnabled: false, ...data } })
  return NextResponse.json({ ok: true, companyId: company.id })
}
