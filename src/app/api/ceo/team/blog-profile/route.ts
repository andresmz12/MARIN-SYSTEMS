import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { BLOG_PROFILE_DEFAULT as D } from '@/lib/blog-profile'
import { ownCompany, teamUser } from '@/lib/team-auth'

// Perfil de la empresa del blog (la que guía a Luis). GET devuelve lo guardado o los valores sugeridos;
// PUT crea la empresa y su perfil si no existen, o los actualiza. El piloto automático de redes queda APAGADO para ella.
const blogCompanyName = () => process.env.BLOG_COMPANY_NAME || D.name

// Con ?companyId= se trabaja con el blog de ESA empresa (cada empresa tiene su propio agente de blog);
// sin él, con la empresa del blog de siempre (Reports Systems).
export async function GET(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const given = new URL(req.url).searchParams.get('companyId')
  const company = given
    ? await ownCompany(u.userId, given)
    : await prisma.cEOCompany.findFirst({ where: { userId: u.userId, name: { contains: blogCompanyName(), mode: 'insensitive' } }, select: { id: true, name: true } })
  const p = company ? await prisma.brandProfile.findFirst({ where: { companyId: company.id } }) : null
  const legacy = !!company && company.name.toLowerCase().includes(blogCompanyName().toLowerCase())
  const pillars = Array.isArray(p?.contentPillars) ? (p!.contentPillars as string[]) : []
  // Los valores sugeridos de Reports Systems solo se usan para esa empresa; las demás arrancan con lo suyo.
  const dflt = legacy || !given
  return NextResponse.json({
    exists: !!p,
    legacy,
    name: company?.name ?? D.name,
    website: p?.website ?? (dflt ? D.website : ''),
    tone: p?.tone ?? (dflt ? D.tone : 'Cercano, claro y profesional.'),
    audience: p?.targetAudience && p.targetAudience !== 'Por definir' ? p.targetAudience : dflt ? D.audience : '',
    topics: pillars.length ? pillars : dflt ? [...D.topics] : [],
    rules: p?.blogRules ?? D.rules,
    cta: p?.blogCta ?? (dflt ? D.cta : ''),
    ctaEn: p?.blogCtaEn ?? '',
    aiWrite: p?.blogAiWrite ?? false,
  })
}

export async function PUT(req: NextRequest) {
  const u = await teamUser()
  if (u instanceof NextResponse) return u
  const b = (await req.json().catch(() => ({}))) as { companyId?: string; website?: string; tone?: string; audience?: string; topics?: string[]; rules?: string; cta?: string; ctaEn?: string; aiWrite?: boolean }
  const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const tone = clean(b.tone, 400), audience = clean(b.audience, 400), rules = clean(b.rules, 1500), cta = clean(b.cta, 400), website = clean(b.website, 200)
  const topics = (Array.isArray(b.topics) ? b.topics : []).map((t) => clean(t, 120)).filter(Boolean).slice(0, 20)
  if (website && !/^https:\/\//i.test(website)) return NextResponse.json({ error: 'La web debe empezar con https://' }, { status: 400 })

  const name = blogCompanyName()
  // Con companyId se usa esa empresa (ya existe); si no, la del blog de siempre, que se crea si falta.
  let company = b.companyId ? await prisma.cEOCompany.findFirst({ where: { id: b.companyId, userId: u.userId } }) : await prisma.cEOCompany.findFirst({ where: { userId: u.userId, name: { contains: name, mode: 'insensitive' } } })
  if (b.companyId && !company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
  if (!company) company = await prisma.cEOCompany.create({ data: { userId: u.userId, name, emoji: '📊', country: ['US'] } })
  const existing = await prisma.brandProfile.findFirst({ where: { companyId: company.id } })
  // En Reports Systems este formulario es el que define tono, público y temas. En las demás empresas (ISM…) esos datos son
  // del perfil de marca de las redes y NO se pisan: aquí solo se guardan los ajustes del blog.
  const ownsBrand = company.name.toLowerCase().includes(name.toLowerCase()) || !existing
  if (ownsBrand && (!tone || !audience || topics.length === 0)) return NextResponse.json({ error: 'Faltan el tono, el público o los temas' }, { status: 400 })
  const blogOnly = { website: website || null, blogRules: rules || null, blogCta: cta || null, blogCtaEn: clean(b.ctaEn, 400) || null, blogAiWrite: b.aiWrite === true, blogEnabled: true }
  const brand = { tone, targetAudience: audience, contentPillars: topics as never }
  if (existing) await prisma.brandProfile.update({ where: { id: existing.id }, data: ownsBrand ? { ...brand, ...blogOnly } : blogOnly })
  else await prisma.brandProfile.create({ data: { userId: u.userId, companyId: company.id, autoEnabled: false, newsEnabled: false, ...brand, ...blogOnly } })
  return NextResponse.json({ ok: true, companyId: company.id })
}
