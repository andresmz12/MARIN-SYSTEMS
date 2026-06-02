import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const history = await prisma.irsVideoContent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      titulo: true,
      guionCompleto: true,
      mapaJson: true,
      createdAt: true,
    },
  })

  return NextResponse.json(history)
}
