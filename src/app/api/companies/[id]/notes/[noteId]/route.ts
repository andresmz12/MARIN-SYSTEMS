import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: { id: string; noteId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, content } = body

  const note = await prisma.companyNote.updateMany({
    where: { id: params.noteId, companyId: params.id, userId: session.user.id },
    data: { title, content },
  })

  if (note.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.companyNote.findFirst({ where: { id: params.noteId } })
  return NextResponse.json(updated)
}

export async function DELETE(_: Request, { params }: { params: { id: string; noteId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.companyNote.deleteMany({
    where: { id: params.noteId, companyId: params.id, userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
