import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const COL_OFFSET_MS = 5 * 60 * 60 * 1000
const JOBS = ['auto-content', 'news-watch', 'publish-due', 'metrics', 'topic-research']

// Resumen del Command Center: qué necesita atención, qué sale pronto, qué salió y cómo va el piloto automático.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const now = new Date()
    const colToday = new Date(now.getTime() - COL_OFFSET_MS).toISOString().slice(0, 10)
    const dayStart = new Date(new Date(`${colToday}T00:00:00Z`).getTime() + COL_OFFSET_MS)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

    const select = { id: true, groupId: true, topic: true, platform: true, status: true, scheduledDate: true, publishedAt: true, externalUrl: true, publishError: true, imageUrl: true, companyId: true, company: { select: { name: true, emoji: true } } }
    const [pending, failed, upcoming, recent, today, ai, runs] = await Promise.all([
      prisma.generatedPost.findMany({ where: { userId, status: 'pending_review' }, select, orderBy: { scheduledDate: 'asc' } }),
      prisma.generatedPost.findMany({ where: { userId, status: 'failed' }, select, orderBy: { updatedAt: 'desc' }, take: 10 }),
      prisma.generatedPost.findMany({ where: { userId, status: { in: ['approved', 'publishing'] }, scheduledDate: { gte: now } }, select, orderBy: { scheduledDate: 'asc' }, take: 30 }),
      prisma.generatedPost.findMany({ where: { userId, status: 'published' }, select, orderBy: { publishedAt: 'desc' }, take: 12 }),
      prisma.generatedPost.findMany({ where: { userId, status: { in: ['approved', 'publishing', 'published', 'failed'] }, OR: [{ scheduledDate: { gte: dayStart, lt: dayEnd } }, { publishedAt: { gte: dayStart, lt: dayEnd } }] }, select, orderBy: { scheduledDate: 'asc' } }),
      prisma.aiStatus.findUnique({ where: { id: 'main' } }),
      Promise.all(JOBS.map((job) => prisma.cronRun.findFirst({ where: { job }, orderBy: { startedAt: 'desc' }, select: { job: true, startedAt: true, finishedAt: true, ok: true, error: true } }))),
    ])

    // Un contenido para varias redes cuenta como uno.
    const uniq = <T extends { id: string; groupId: string | null }>(rows: T[]) => {
      const seen = new Set<string>()
      return rows.filter((r) => { const k = r.groupId ?? r.id; if (seen.has(k)) return false; seen.add(k); return true })
    }
    const group = <T extends { id: string; groupId: string | null; platform: string }>(rows: T[]) =>
      uniq(rows).map((r) => ({ ...r, platforms: rows.filter((x) => (x.groupId ?? x.id) === (r.groupId ?? r.id)).map((x) => x.platform) }))

    const pendingGroups = uniq(pending)
    return NextResponse.json({
      colToday,
      pending: { total: pendingGroups.length, missingImages: pendingGroups.filter((p) => !p.imageUrl).length, items: group(pending).slice(0, 6) },
      failed: failed.map((f) => ({ id: f.id, topic: f.topic, platform: f.platform, error: f.publishError, company: f.company })),
      today: group(today),
      upcoming: group(upcoming).slice(0, 6),
      recent: group(recent).slice(0, 5),
      ai: { failing: !!ai?.failKind, kind: ai?.failKind ?? null, message: ai?.failMessage ?? null, since: ai?.failAt ?? null },
      runs: runs.filter(Boolean),
    })
  } catch (err) {
    console.error('[ceo/home]', err)
    return NextResponse.json({ error: 'No se pudo cargar el resumen' }, { status: 500 })
  }
}
