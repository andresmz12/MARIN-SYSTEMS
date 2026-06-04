import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CompanySchema } from '@/lib/schemas'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const companies = await prisma.company.findMany({
      where: { userId: session.user.id },
      include: {
        tasks: { where: { status: { not: 'completada' } }, select: { id: true, status: true, priority: true, dueDate: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(companies)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener empresas' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = CompanySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { name, description, emoji, color, status, industry } = parsed.data

    const company = await prisma.company.create({
      data: {
        userId: session.user.id,
        name,
        description: description ?? null,
        emoji: emoji ?? '🏢',
        color: color ?? '#2563eb',
        status: status ?? 'activa',
        industry: industry ?? null,
      },
      include: { tasks: true },
    })

    return NextResponse.json(company, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al crear empresa' }, { status: 500 })
  }
}
