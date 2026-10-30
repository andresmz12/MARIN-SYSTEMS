import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function teamUser(): Promise<{ userId: string } | NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return { userId: session.user.id }
}

export async function ownCompany(userId: string, companyId: string | null | undefined) {
  if (!companyId) return null
  return prisma.cEOCompany.findFirst({ where: { id: companyId, userId }, select: { id: true, name: true } })
}
