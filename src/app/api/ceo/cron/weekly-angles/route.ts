import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateContentAngles } from '@/lib/ai'

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const profiles = await prisma.brandProfile.findMany({
      select: {
        companyId: true,
        targetAudience: true,
        contentPillars: true,
        competitors: true,
        company: { select: { name: true } },
      },
    })

    let processed = 0
    let created = 0
    const errors: string[] = []

    for (const profile of profiles) {
      processed++
      try {
        const angles = await generateContentAngles({
          companyName: profile.company.name,
          targetAudience: profile.targetAudience,
          contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
          competitors: Array.isArray(profile.competitors) ? (profile.competitors as string[]) : [],
        })

        for (const a of angles) {
          await prisma.contentAngle.create({
            data: {
              companyId: profile.companyId,
              angle: a.angle,
              hook: a.hook,
              sourceCompetitor: a.sourceCompetitor ?? null,
            },
          })
          created++
        }
      } catch (err) {
        errors.push(`${profile.company.name}: ${String(err)}`)
      }
    }

    console.log(`[cron/weekly-angles] processed=${processed} created=${created} errors=${errors.length}`)
    return NextResponse.json({ processed, created, errors })
  } catch (err) {
    console.error('[cron/weekly-angles]', err)
    return NextResponse.json({ error: 'Error generando ángulos semanales' }, { status: 500 })
  }
}
