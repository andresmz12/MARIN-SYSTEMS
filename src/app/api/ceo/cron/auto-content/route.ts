import { NextResponse } from 'next/server'
import { withCronLog } from '@/lib/cron-run'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'
import { buildGroupDrafts, recentFeedback, referenceLines } from '@/lib/auto-content'
import { GROUP_IMAGE_PLATFORM } from '@/lib/image-prompt'
import { sendContentReadyEmail } from '@/lib/sendgrid-client'
import { AUTO_PLATFORMS, isAutoPlatform } from '@/lib/platforms'

export const maxDuration = 300

// Lunes, miércoles y viernes: "un día por medio" generado de una vez, para que el
// dueño genere todas las imágenes de la semana en una sola sesión.
const POST_DAYS = [1, 3, 5]
// 1:00 PM Colombia (UTC-5) = 18:00 UTC.
const POST_HOUR_UTC = 18
// No acumular más borradores de los que el dueño alcanza a revisar.
const MAX_PENDING = 24

/** Próximas fechas de publicación (L/X/V a las 1 PM COL), estrictamente futuras. */
function nextSlots(from: Date): Date[] {
  const slots: Date[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), POST_HOUR_UTC))
  while (slots.length < POST_DAYS.length) {
    if (POST_DAYS.includes(cursor.getUTCDay()) && cursor.getTime() > from.getTime()) {
      slots.push(new Date(cursor))
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return slots
}

async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Sin clave, generateMarketingContent devuelve texto de relleno: mejor fallar que guardar basura.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurado' }, { status: 500 })
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
        const now = new Date()
        const [upcoming, pending] = await Promise.all([
          prisma.generatedPost.count({
            where: { companyId: profile.companyId, source: 'auto', scheduledDate: { gt: now } },
          }),
          prisma.generatedPost.count({
            where: { companyId: profile.companyId, status: 'pending_review' },
          }),
        ])

        // Ya hay una tanda futura sin publicar: no generar otra encima.
        if (!force && upcoming > 0) {
          summary.push({ company: name, created: 0, skipped: 'ya hay posts programados' })
          continue
        }
        if (!force && pending >= MAX_PENDING) {
          summary.push({ company: name, created: 0, skipped: `${pending} posts sin revisar` })
          continue
        }

        const selected = profile.autoPlatforms.filter(isAutoPlatform)
        const platforms: string[] = selected.length > 0 ? selected : [...AUTO_PLATFORMS]
        const pillars = Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : []
        const references = referenceLines(profile.references)
        const feedback = await recentFeedback(profile.companyId)

        // Un ángulo nuevo por día; si no quedan, se rota por pilar.
        const angles = await prisma.contentAngle.findMany({
          where: { companyId: profile.companyId, status: 'new' },
          orderBy: { createdAt: 'asc' },
          take: POST_DAYS.length,
        })
        const previousCycles = await prisma.generatedPost.count({
          where: { companyId: profile.companyId, source: 'auto', platform: platforms[0] },
        })

        const usedTopics: string[] = []
        const drafts: Prisma.GeneratedPostCreateManyInput[] = []
        const usedAngleIds: string[] = []

        const slots = nextSlots(now)
        for (let i = 0; i < slots.length; i++) {
          const scheduledDate = slots[i]
          const angle = angles[i]
          const pillar = pillars.length > 0 ? pillars[(previousCycles + i) % pillars.length] : undefined
          // Un solo contenido por día, compartido por todas las redes.
          const avoid = usedTopics.length ? ` NO repitas estos temas de otros días: ${usedTopics.join('; ')}.` : ''
          const generated = await generateMarketingContent({
            companyName: name,
            platform: GROUP_IMAGE_PLATFORM,
            contentType: 'post',
            topic: avoid.trim(),
            tone: profile.tone,
            targetAudience: profile.targetAudience,
            contentPillars: pillars,
            pillar,
            references: references.length > 0 ? references : undefined,
            feedback: feedback.length > 0 ? feedback : undefined,
            angles: angle ? [{ angle: angle.angle, hook: angle.hook }] : undefined,
            voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
            forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
          })
          // Claude falló y ai.ts devolvió el texto de relleno: abortar esta marca.
          if (generated.copy.includes('[Contenido de ')) {
            throw new Error('La IA no devolvió contenido válido (se descarta toda la tanda)')
          }
          drafts.push(...buildGroupDrafts({
            userId: profile.userId,
            companyId: profile.companyId,
            brandProfileId: profile.id,
            platforms,
            generated,
            scheduledDate,
            source: 'auto',
          }))
          const dayTopics = [generated.topic]
          usedTopics.push(...dayTopics)
          if (angle) usedAngleIds.push(angle.id)
        }

        // Todo o nada: así un fallo a mitad no deja una tanda incompleta.
        await prisma.$transaction([
          prisma.generatedPost.createMany({ data: drafts }),
          prisma.contentAngle.updateMany({ where: { id: { in: usedAngleIds } }, data: { status: 'used' } }),
        ])
        const created = drafts.length

        if (created > 0) {
          const notify = await sendContentReadyEmail({ companyName: name, count: created, pendingTotal: pending + created })
          if (!notify.success) console.error('[cron/auto-content] aviso por correo falló:', notify.error)
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

export const POST = withCronLog('auto-content', handler)
