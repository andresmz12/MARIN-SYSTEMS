import { NextResponse } from 'next/server'
import { getISODay, getISOWeek } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'

export const maxDuration = 300

// El workflow corre a diario; esto garantiza "un día por medio" con margen para
// que un cron que se atrasa unas horas no se salte ni duplique un ciclo.
const MIN_GAP_MS = 44 * 60 * 60 * 1000
// No acumular más borradores de los que el dueño alcanza a revisar.
const MAX_PENDING = 8

export async function POST(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await req.json().catch(() => ({}))) as { force?: boolean }
  const force = body.force === true

  try {
    const profiles = await prisma.brandProfile.findMany({
      where: { autoEnabled: true },
      include: { company: { select: { id: true, name: true } } },
    })

    const summary: { company: string; created: number; skipped?: string; error?: string }[] = []

    for (const profile of profiles) {
      const name = profile.company.name
      try {
        const [last, pending] = await Promise.all([
          prisma.generatedPost.findFirst({
            where: { companyId: profile.companyId, source: 'auto' },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          prisma.generatedPost.count({
            where: { companyId: profile.companyId, status: 'pending_review' },
          }),
        ])

        if (!force && last && Date.now() - last.createdAt.getTime() < MIN_GAP_MS) {
          summary.push({ company: name, created: 0, skipped: 'ciclo reciente' })
          continue
        }
        if (!force && pending >= MAX_PENDING) {
          summary.push({ company: name, created: 0, skipped: `${pending} posts sin revisar` })
          continue
        }

        const platforms = profile.autoPlatforms.length > 0 ? profile.autoPlatforms : ['instagram']
        const pillars = Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : []

        // Un ángulo nuevo por ciclo; si no quedan, se rota por pilar.
        const angle = await prisma.contentAngle.findFirst({
          where: { companyId: profile.companyId, status: 'new' },
          orderBy: { createdAt: 'asc' },
        })
        const cycles = await prisma.generatedPost.count({
          where: { companyId: profile.companyId, source: 'auto', platform: platforms[0] },
        })
        const pillar = pillars.length > 0 ? pillars[cycles % pillars.length] : undefined

        // El post sale al día siguiente; semana y día ISO salen de esa fecha.
        const scheduledDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const weekNumber = getISOWeek(scheduledDate)
        const dayOfWeek = Math.min(5, getISODay(scheduledDate))

        const usedTopics: string[] = []
        let created = 0
        for (const platform of platforms) {
          const generated = await generateMarketingContent({
            companyName: name,
            platform,
            contentType: 'post',
            topic: usedTopics.length
              ? `Misma idea central que estos posts de hoy, adaptada al formato de ${platform}: ${usedTopics.join('; ')}.`
              : '',
            tone: profile.tone,
            targetAudience: profile.targetAudience,
            contentPillars: pillars,
            pillar,
            angles: angle ? [{ angle: angle.angle, hook: angle.hook }] : undefined,
            voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
            forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
          })
          usedTopics.push(generated.topic)

          await prisma.generatedPost.create({
            data: {
              userId: profile.userId,
              companyId: profile.companyId,
              brandProfileId: profile.id,
              platform,
              contentType: 'post',
              topic: generated.topic,
              copy: generated.copy,
              hashtags: generated.hashtags,
              cta: generated.cta,
              contentNotes: generated.contentNotes,
              imagePrompt: generated.imagePrompt,
              status: 'pending_review',
              source: 'auto',
              scheduledDate,
              weekNumber,
              dayOfWeek,
            },
          })
          created++
        }

        if (angle) {
          await prisma.contentAngle.update({ where: { id: angle.id }, data: { status: 'used' } })
        }
        summary.push({ company: name, created })
      } catch (err) {
        console.error(`[cron/auto-content] ${name}`, err)
        summary.push({ company: name, created: 0, error: String(err) })
      }
    }

    console.log('[cron/auto-content]', JSON.stringify(summary))
    return NextResponse.json({ processed: profiles.length, summary })
  } catch (err) {
    console.error('[cron/auto-content]', err)
    return NextResponse.json({ error: 'Error generando contenido automático' }, { status: 500 })
  }
}
