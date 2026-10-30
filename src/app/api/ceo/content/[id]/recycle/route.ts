import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateMarketingContent } from '@/lib/ai'
import { buildGroupDrafts, factCheckGroup, recentFeedback, referenceLines } from '@/lib/auto-content'
import { knowledgeFor } from '@/lib/knowledge'
import { GROUP_IMAGE_PLATFORM } from '@/lib/image-prompt'
import { asAgent } from '@/lib/agent-job'

export const maxDuration = 120

const MIN_AGE_DAYS = 14
const POST_HOUR_UTC = 18 // 1 PM Colombia

// Reutiliza un post que ya funcionó: mismo tema, otro gancho y otro enfoque, con los datos revisados otra vez.
// Queda como borrador por aprobar, en el próximo día libre.
async function handlePOST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const post = await prisma.generatedPost.findFirst({ where: { id: params.id, userId: session.user.id }, include: { company: true, brandProfile: true } })
  if (!post) return NextResponse.json({ error: 'Contenido no encontrado' }, { status: 404 })
  if (post.status !== 'published' || !post.publishedAt) return NextResponse.json({ error: 'Solo se pueden reutilizar posts ya publicados' }, { status: 400 })
  const ageDays = (Date.now() - post.publishedAt.getTime()) / 86400000
  if (ageDays < MIN_AGE_DAYS) return NextResponse.json({ error: `Espera ${Math.ceil(MIN_AGE_DAYS - ageDays)} días más: reutilizar un post tan reciente se vería repetido` }, { status: 400 })

  // Mismas redes que el original; el borrador queda en el próximo día sin posts programados.
  const group = post.groupId ? await prisma.generatedPost.findMany({ where: { groupId: post.groupId }, select: { platform: true } }) : [{ platform: post.platform }]
  const platforms = Array.from(new Set(group.map((g) => g.platform)))
  const taken = new Set((await prisma.generatedPost.findMany({
    where: { companyId: post.companyId, status: { notIn: ['rejected'] }, scheduledDate: { gte: new Date() } }, select: { scheduledDate: true },
  })).map((p) => p.scheduledDate?.toISOString().slice(0, 10)))
  const slot = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, POST_HOUR_UTC))
  while (taken.has(slot.toISOString().slice(0, 10)) || [0, 6].includes(slot.getUTCDay())) slot.setUTCDate(slot.getUTCDate() + 1)

  const profile = post.brandProfile
  const references = referenceLines(profile.references)
  const feedback = await recentFeedback(post.companyId)
  const generated = await generateMarketingContent({
    companyName: post.company.name,
    platform: GROUP_IMAGE_PLATFORM,
    contentType: 'post',
    topic: `REUTILIZA este tema que ya funcionó: "${post.topic}". Escríbelo con OTRO gancho y OTRO enfoque; no copies este texto anterior: """${post.copy.slice(0, 600)}""". Verifica en fuentes oficiales que cada dato (montos, fechas, requisitos) siga vigente HOY y actualízalo si cambió; si un dato ya no aplica, no lo uses.`,
    research: true,
    knowledge: await knowledgeFor(post.userId, post.companyId, `${post.topic} ${post.copy}`),
    tone: profile.tone,
    targetAudience: profile.targetAudience,
    contentPillars: Array.isArray(profile.contentPillars) ? (profile.contentPillars as string[]) : [],
    references: references.length > 0 ? references : undefined,
    feedback: feedback.length > 0 ? feedback : undefined,
    voiceSamples: Array.isArray(profile.voiceSamples) ? (profile.voiceSamples as string[]) : undefined,
    forbiddenWords: Array.isArray(profile.forbiddenWords) ? (profile.forbiddenWords as string[]) : undefined,
  })
  if (generated.copy.includes('[Contenido de ')) {
    return NextResponse.json({ error: `${generated.failure?.message ?? 'La IA no devolvió contenido válido.'} No se creó nada.` }, { status: 502 })
  }
  const drafts = buildGroupDrafts({
    userId: post.userId, companyId: post.companyId, brandProfileId: post.brandProfileId, platforms,
    generated, scheduledDate: slot, source: 'recycled', kind: post.kind ?? undefined,
  })
  await prisma.generatedPost.createMany({ data: drafts })
  const gid = drafts[0]?.groupId
  if (gid) await factCheckGroup(gid).catch((e) => console.error('[recycle] verificación falló:', e))
  return NextResponse.json({ ok: true, scheduledDate: slot.toISOString(), topic: generated.topic })
}

export const POST = asAgent('fernanda', 'Reutilizó un post que había funcionado, con otro enfoque', handlePOST)
