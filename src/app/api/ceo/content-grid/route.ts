import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')
    const weekNumber = Number(searchParams.get('weekNumber'))

    if (!companyId || !weekNumber) {
      return NextResponse.json({ error: 'companyId y weekNumber requeridos' }, { status: 400 })
    }

    const posts = await prisma.generatedPost.findMany({
      where: { userId: session.user.id, companyId, weekNumber },
      include: { company: true },
      orderBy: [{ dayOfWeek: 'asc' }, { platform: 'asc' }],
    })

    return NextResponse.json(posts)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener la parrilla' }, { status: 500 })
  }
}
