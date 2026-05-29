import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CEOCompanyUpdateSchema } from '@/lib/ceo'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const parsed = CEOCompanyUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existing = await prisma.cEOCompany.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!existing) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const company = await prisma.cEOCompany.update({
      where: { id: params.id },
      data: parsed.data,
    })

    return NextResponse.json(company)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al actualizar empresa' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const existing = await prisma.cEOCompany.findFirst({
      where: { id: params.id, userId: session.user.id },
    })
    if (!existing) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    // Cascade removes related marketing ideas and work blocks.
    await prisma.cEOCompany.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al eliminar empresa' }, { status: 500 })
  }
}
