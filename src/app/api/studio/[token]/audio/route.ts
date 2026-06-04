import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  const session = await prisma.studioSession.findUnique({
    where: { token },
    select: { audioPath: true, expiresAt: true },
  })

  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.expiresAt < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })
  if (!session.audioPath || !existsSync(session.audioPath)) {
    return NextResponse.json({ error: 'no_audio' }, { status: 404 })
  }

  const buffer = await readFile(session.audioPath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `attachment; filename="audio-${token}.mp3"`,
      'Content-Length': String(buffer.length),
    },
  })
}
