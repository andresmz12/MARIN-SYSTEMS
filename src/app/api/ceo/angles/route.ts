import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { generateContentAngles } from '@/lib/ai'

const GenerateSchema = z.object({
  companyId: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const body = await req.json()
    const parsed = GenerateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { companyId } = parsed.data

    const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const profile = await prisma.brandProfile.findUnique({ where: { companyId } })
    if (!profile) {
      return NextResponse.json({ error: 'Configura primero el perfil de marca de esta empresa' }, { status: 400 })
    }

    const angles = await generateContentAngles({
      companyName: company.name,
      targetAudience: profile.targetAudience,
      contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
      competitors: Array.isArray(profile.competitors) ? (profile.competitors as string[]) : [],
    })

    if (angles.length === 0) {
      return NextResponse.json({ error: 'No se pudieron generar ángulos. Intenta de nuevo.' }, { status: 502 })
    }

    const saved = await prisma.$transaction(
      angles.map((a) =>
        prisma.contentAngle.create({
          data: {
            companyId,
            angle: a.angle,
            hook: a.hook,
            sourceCompetitor: a.sourceCompetitor ?? null,
          },
        }),
      ),
    )

    return NextResponse.json(saved, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al generar ángulos' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

    const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const angles = await prisma.contentAngle.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(angles)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener ángulos' }, { status: 500 })
  }
}
