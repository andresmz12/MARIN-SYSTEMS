import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createReadStream, existsSync } from 'fs'
import { stat } from 'fs/promises'

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  const session = await prisma.studioSession.findUnique({
    where: { token },
    select: { audioPath: true, audioData: true, expiresAt: true },
  })
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.expiresAt < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  // ── File stream (new sessions) ──
  if (session.audioPath && existsSync(session.audioPath)) {
    const { size } = await stat(session.audioPath)
    const range    = req.headers.get('range')

    if (range) {
      const m     = range.match(/bytes=(\d*)-(\d*)/)
      const start = m && m[1] ? parseInt(m[1]) : 0
      const end   = m && m[2] ? parseInt(m[2]) : size - 1
      const len   = end - start + 1
      return new NextResponse(createReadStream(session.audioPath, { start, end }) as any, {
        status: 206,
        headers: {
          'Content-Type':   'audio/mpeg',
          'Content-Length': String(len),
          'Content-Range':  `bytes ${start}-${end}/${size}`,
          'Accept-Ranges':  'bytes',
          'Cache-Control':  'public, max-age=3600',
        },
      })
    }

    return new NextResponse(createReadStream(session.audioPath) as any, {
      headers: {
        'Content-Type':   'audio/mpeg',
        'Content-Length': String(size),
        'Accept-Ranges':  'bytes',
        'Cache-Control':  'public, max-age=3600',
      },
    })
  }

  // ── Legacy base64 fallback ──
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
