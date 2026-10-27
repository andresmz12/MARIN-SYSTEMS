import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Bandeja de revisión: posts generados automáticamente que esperan aprobación.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const posts = await prisma.generatedPost.findMany({
      where: { userId: session.user.id, status: { in: ['pending_review', 'approved'] } },
      include: { company: true },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json(posts)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener la bandeja' }, { status: 500 })
  }
}
