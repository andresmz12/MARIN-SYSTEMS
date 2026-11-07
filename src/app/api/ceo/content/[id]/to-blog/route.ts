import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mirrorPostToBlog } from '@/lib/blog-mirror'

export const maxDuration = 60

// Envía este post, tal cual, como borrador al blog de otra empresa. No usa IA.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { companyId?: string }
  const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id }, select: { id: true } })
  const dest = b.companyId ? await prisma.cEOCompany.findFirst({ where: { id: b.companyId, userId: session.user.id }, select: { id: true } }) : null
  if (!post || !dest) return NextResponse.json({ error: 'Post o blog de destino no encontrado' }, { status: 404 })
  const r = await mirrorPostToBlog(post.id, dest.id)
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
