import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { publishPost } from '@/lib/publisher'

export const maxDuration = 60

// "Publicar ahora": envía el post al webhook de publicación sin esperar a su hora.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await publishPost(params.id, { userId: session.user.id })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'No se pudo publicar' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
