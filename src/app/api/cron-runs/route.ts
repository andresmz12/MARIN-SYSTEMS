import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Última corrida de cada tarea automática + las fallas recientes.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const jobs = await prisma.cronRun.findMany({ distinct: ['job'], select: { job: true } })
    const latest = await Promise.all(
      jobs.map((j) => prisma.cronRun.findFirst({ where: { job: j.job }, orderBy: { startedAt: 'desc' } })),
    )
    const failures = await prisma.cronRun.findMany({
      where: { ok: false, startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { startedAt: 'desc' },
      take: 10,
    })
    return NextResponse.json({
      latest: latest.filter((r) => r != null).sort((a, b) => a!.job.localeCompare(b!.job)),
      failures,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al obtener la bitácora' }, { status: 500 })
  }
}
