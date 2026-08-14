import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = await prisma.company.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      tasks: { orderBy: { createdAt: 'desc' } },
      notes: { orderBy: { createdAt: 'desc' } },
      teamMembers: true,
      links: true,
      corporateTasks: {
        where: { status: { not: 'completed' } },
        orderBy: { dueDate: 'asc' },
        select: { id: true, title: true, priority: true, status: true, dueDate: true },
      },
      ceoCompany: { select: { id: true } },
    },
  })

  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(company)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, description, emoji, color, status, industry } = body

  const company = await prisma.company.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { name, description, emoji, color, status, industry },
  })

  if (company.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.company.findFirst({ where: { id: params.id } })
  return NextResponse.json(updated)
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.company.deleteMany({ where: { id: params.id, userId: session.user.id } })
  return NextResponse.json({ ok: true })
}
