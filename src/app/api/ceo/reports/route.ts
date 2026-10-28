import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Últimos informes de los agentes (métricas, temas) de una empresa.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

  const reports = await prisma.agentReport.findMany({
    where: { userId: session.user.id, companyId },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  return NextResponse.json(reports)
}
