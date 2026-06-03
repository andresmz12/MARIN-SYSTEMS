import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { existsSync } from 'fs'

export async function POST(req: NextRequest) {
  // Allow cron calls with CLEANUP_SECRET, or any authenticated user
  const secret = req.headers.get('x-cleanup-secret')
  const isAuthorized =
    (process.env.CLEANUP_SECRET && secret === process.env.CLEANUP_SECRET) ||
    !!(await getServerSession(authOptions))

  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const expired = await prisma.studioSession.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, audioPath: true },
  })

  let filesDeleted = 0
  for (const s of expired) {
    if (s.audioPath && existsSync(s.audioPath)) {
      await unlink(s.audioPath).catch(() => {})
      filesDeleted++
    }
  }

  if (expired.length) {
    await prisma.studioSession.deleteMany({ where: { id: { in: expired.map(s => s.id) } } })
  }

  return NextResponse.json({
    sessionsDeleted: expired.length,
    filesDeleted,
  })
}
