import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishConfigured } from '@/lib/publisher'
import { publishablePlatforms } from '@/lib/platforms'

export const dynamic = 'force-dynamic'

// Bandeja de revisión y seguimiento: por aprobar, aprobados/en envío, fallidos y lo
// publicado en los últimos 7 días (con su enlace).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const posts = await prisma.generatedPost.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { status: { in: ['pending_review', 'approved', 'publishing', 'failed'] } },
          { status: 'published', publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
      include: { company: true },
      orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json({ posts, publishConfigured: publishConfigured(), publishPlatforms: publishablePlatforms() })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener la bandeja' }, { status: 500 })
  }
}
