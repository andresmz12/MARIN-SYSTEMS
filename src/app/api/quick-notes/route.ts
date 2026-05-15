import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const note = await prisma.quickNote.findUnique({
      where: { userId: session.user.id },
    })

    return NextResponse.json({ content: note?.content ?? '' })
  } catch (error) {
    console.error('[GET /api/quick-notes]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { content } = await req.json()

    await prisma.quickNote.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, content: content ?? '' },
      update: { content: content ?? '' },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[PUT /api/quick-notes]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
