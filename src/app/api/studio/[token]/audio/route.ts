import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createReadStream, existsSync } from 'fs'
import { stat } from 'fs/promises'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  const session = await prisma.studioSession.findUnique({
    where: { token },
    select: { audioPath: true, audioData: true, expiresAt: true },
  })
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.expiresAt < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  // Prefer file stream; fall back to legacy base64 in DB
  if (session.audioPath && existsSync(session.audioPath)) {
    const { size } = await stat(session.audioPath)
    const stream   = createReadStream(session.audioPath)
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type':   'audio/mpeg',
        'Content-Length': String(size),
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public, max-age=3600',
      },
    })
  }

  // Legacy: serve from base64 stored in DB
  if (session.audioData) {
    const buf = Buffer.from(session.audioData, 'base64')
    return new NextResponse(buf, {
      headers: {
        'Content-Type':   'audio/mpeg',
        'Content-Length': String(buf.length),
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public, max-age=3600',
      },
    })
  }

  return new NextResponse('Audio no encontrado', { status: 404 })
}
