import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { streamJarvisVoice } from '@/lib/jarvis-voice'

export const dynamic = 'force-dynamic'

// GET (not POST) so the <audio> element can set `src` directly and stream
// natively — a fetch()+blob() round trip forces buffering the entire clip
// before a single sample can play.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const text = req.nextUrl.searchParams.get('text') ?? ''
  if (!text.trim()) return NextResponse.json({ error: 'Se requiere text' }, { status: 400 })

  try {
    const stream = await streamJarvisVoice(text)
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error generando audio'
    console.error('[assistant/speak] TTS failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
