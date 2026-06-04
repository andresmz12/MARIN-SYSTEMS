import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  const session = await prisma.studioSession.findUnique({ where: { token } })
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.expiresAt < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  return NextResponse.json({ mapaJson: session.mapaJson, guion: session.guion, audioPath: session.audioPath ?? null })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const auth = await getServerSession(authOptions)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = params
  const body = await req.json() as { mapaJson?: unknown; guion?: string }

  const session = await prisma.studioSession.findUnique({ where: { token } })
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.userId && session.userId !== auth.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.studioSession.update({
    where: { token },
    data: {
      ...(body.mapaJson !== undefined && { mapaJson: body.mapaJson as any }),
      ...(body.guion    !== undefined && { guion: body.guion }),
      isEdited: true,
    },
  })

  return NextResponse.json({ ok: true })
}
