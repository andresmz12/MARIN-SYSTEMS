import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Colombia no tiene horario de verano: UTC-5 fijo.
const COL_OFFSET_MS = 5 * 60 * 60 * 1000
const colDay = (d: Date) => new Date(d.getTime() - COL_OFFSET_MS).toISOString().slice(0, 10)
const colTime = (d: Date) => new Date(d.getTime() - COL_OFFSET_MS).toISOString().slice(11, 16)

// Prioridad para resumir el estado de un grupo (el mismo contenido en varias redes).
const RANK = ['failed', 'publishing', 'published', 'approved', 'ready', 'pending_review', 'draft', 'rejected']
const worst = (statuses: string[]) => RANK.find((s) => statuses.includes(s)) ?? statuses[0]

// Calendario: lo que se subió (o está programado) cada día del mes, por empresa. Un contenido = un ítem, con sus redes.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  const month = searchParams.get('month') ?? ''
  if (!companyId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'companyId y month (AAAA-MM) son requeridos' }, { status: 400 })
  }
  const [y, m] = month.split('-').map(Number)
  // Mes completo en hora de Colombia, con margen de un día a cada lado para el cambio de huso.
  const from = new Date(Date.UTC(y, m - 1, 1) + COL_OFFSET_MS)
  const to = new Date(Date.UTC(y, m, 1) + COL_OFFSET_MS)

  try {
    const posts = await prisma.generatedPost.findMany({
      where: {
        userId: session.user.id,
        companyId,
        OR: [{ publishedAt: { gte: from, lt: to } }, { publishedAt: null, scheduledDate: { gte: from, lt: to } }],
      },
      select: { id: true, groupId: true, topic: true, platform: true, status: true, source: true, sourceUrl: true, externalUrl: true, imageUrl: true, slideImageUrls: true, scheduledDate: true, publishedAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const groups = new Map<string, typeof posts>()
    for (const p of posts) {
      const k = p.groupId ?? p.id
      groups.set(k, [...(groups.get(k) ?? []), p])
    }
    const days: Record<string, unknown[]> = {}
    for (const rows of Array.from(groups.values())) {
      const first = rows[0]
      const when = first.publishedAt ?? first.scheduledDate
      if (!when) continue
      const key = colDay(when)
      ;(days[key] ??= []).push({
        id: first.id,
        topic: first.topic,
        source: first.source,
        sourceUrl: first.sourceUrl,
        status: worst(rows.map((r) => r.status)),
        time: colTime(when),
        carousel: first.slideImageUrls.length > 1 ? first.slideImageUrls.length : 0,
        hasImage: !!first.imageUrl,
        platforms: rows.map((r) => ({ platform: r.platform, status: r.status, url: r.externalUrl })),
      })
    }
    return NextResponse.json({ month, days })
  } catch (err) {
    console.error('[calendar]', err)
    return NextResponse.json({ error: 'No se pudo cargar el calendario' }, { status: 500 })
  }
}
