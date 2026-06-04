import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notes = await prisma.companyNote.findMany({
    where: { companyId: params.id, userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(notes)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, content } = body

  if (!title || !content) return NextResponse.json({ error: 'Title and content required' }, { status: 400 })

  const note = await prisma.companyNote.create({
    data: { companyId: params.id, userId: session.user.id, title, content },
  })

  return NextResponse.json(note, { status: 201 })
}
