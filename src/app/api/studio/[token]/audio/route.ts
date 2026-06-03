import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  const session = await prisma.studioSession.findUnique({
    where: { token },
    select: { audioData: true, expiresAt: true },
  })
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.expiresAt < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const buf = Buffer.from(session.audioData, 'base64')
  return new NextResponse(buf, {
    headers: {
      'Content-Type':   'audio/mpeg',
      'Content-Length': String(buf.length),
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'public, max-age=86400',
    },
  })
}
