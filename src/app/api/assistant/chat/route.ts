import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { chatWithJarvis, JarvisMessage } from '@/lib/jarvis'

export const dynamic = 'force-dynamic'

function validateHistory(body: unknown): JarvisMessage[] | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.messages)) return null
  const messages: JarvisMessage[] = []
  for (const m of b.messages) {
    if (typeof m !== 'object' || m === null) return null
    const mm = m as Record<string, unknown>
    if ((mm.role !== 'user' && mm.role !== 'assistant') || typeof mm.content !== 'string') return null
    messages.push({ role: mm.role, content: mm.content.slice(0, 4000) })
  }
  // Cap history so tokens (and cost) don't grow unbounded across a long session.
  return messages.slice(-20)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const history = validateHistory(await req.json().catch(() => null))
  if (!history || history.length === 0) {
    return NextResponse.json({ error: 'Se requiere messages: {role, content}[]' }, { status: 400 })
  }

  const result = await chatWithJarvis(session.user.id, history)
  return NextResponse.json(result)
}
