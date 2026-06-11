import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const news = await prisma.irsNews.findMany({
    orderBy: { publishedAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(news)
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, used } = await req.json()
  const updated = await prisma.irsNews.update({ where: { id }, data: { used } })
  return NextResponse.json(updated)
}
