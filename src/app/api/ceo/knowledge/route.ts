import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const MAX_DOC_CHARS = 60_000

const Schema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(20, 'El texto es muy corto').max(MAX_DOC_CHARS, 'El documento es muy largo (máx. 60.000 caracteres): divídelo en partes'),
  sourceUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  companyId: z.string().nullable().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const docs = await prisma.knowledgeDoc.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, kind: true, sourceUrl: true, companyId: true, createdAt: true, content: true },
  })
  return NextResponse.json(docs.map(({ content, ...d }) => ({ ...d, chars: content.length })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const parsed = Schema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    const { title, content, sourceUrl, companyId } = parsed.data
    if (companyId) {
      const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId }, select: { id: true } })
      if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }
    const doc = await prisma.knowledgeDoc.create({
      data: { userId, title, content, sourceUrl: sourceUrl || null, companyId: companyId ?? null },
      select: { id: true, title: true },
    })
    return NextResponse.json(doc)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al guardar el documento' }, { status: 500 })
  }
}
