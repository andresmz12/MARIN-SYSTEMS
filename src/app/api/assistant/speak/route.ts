import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { synthesizeJarvisVoice } from '@/lib/jarvis-voice'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text : ''
  if (!text.trim()) return NextResponse.json({ error: 'Se requiere text' }, { status: 400 })

  try {
    const audio = await synthesizeJarvisVoice(text)
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error generando audio'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
