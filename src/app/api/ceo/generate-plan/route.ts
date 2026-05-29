import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  GeneratePlanSchema, FOREX_COMPANY_NAME, PERSONAL_COMPANY_NAME,
  FIXED_BLOCKS, WORK_SLOTS, parseDateOnly, isWeekend, hoursBetween, splitSlot,
  encodeBlockDetails,
} from '@/lib/ceo'
import { generateBlockContent } from '@/lib/ai'
import type { CEOCompany, MarketingIdea, WorkBlock, Prisma } from '@prisma/client'

interface ScoredCompany {
  company: CEOCompany
  score: number
  ideasNew: MarketingIdea[]
  ideasInProgress: MarketingIdea[]
  carryover: WorkBlock[]
}

/** A company-block placement to be filled with AI content. */
interface PlannedSlot {
  start: string
  end: string
  durationHours: number
  target: ScoredCompany
  linkedIdeaId: string | null
}

/** Find or create a hidden system pseudo-company (used for fixed routine blocks). */
async function ensureSystemCompany(
  userId: string,
  name: string,
  emoji: string,
  color: string,
): Promise<CEOCompany> {
  const existing = await prisma.cEOCompany.findFirst({ where: { userId, name } })
  if (existing) return existing
  return prisma.cEOCompany.create({
    data: { userId, name, emoji, color, isActive: false, strategicWeight: 1, country: [] },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const body = await req.json()
    const parsed = GeneratePlanSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const { date: dateStr, availableHours } = parsed.data
    const date = parseDateOnly(dateStr)

    // 1. Weekends are for resting.
    if (isWeekend(date)) {
      return NextResponse.json({ error: 'Los fines de semana son para descansar 🏖️' }, { status: 400 })
    }

    // 2. Block if a plan already exists for this date.
    const existingPlan = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId, date } },
    })
    if (existingPlan) {
      return NextResponse.json({ error: 'Ya existe un plan para este día', canRegenerate: true }, { status: 409 })
    }

    // 3. Active companies (system pseudo-companies excluded).
    const companies = await prisma.cEOCompany.findMany({
      where: {
        userId,
        isActive: true,
        name: { notIn: [FOREX_COMPANY_NAME, PERSONAL_COMPANY_NAME] },
      },
    })
    if (companies.length === 0) {
      return NextResponse.json({ error: 'No hay empresas activas para planificar' }, { status: 400 })
    }
    const companyIds = companies.map((c) => c.id)

    // 4. Ideas + carryover blocks for scoring (algorithm unchanged).
    const ideas = await prisma.marketingIdea.findMany({
      where: { userId, companyId: { in: companyIds }, status: { in: ['idea', 'in_progress'] } },
      orderBy: { priority: 'desc' },
    })
    const carryoverBlocks = await prisma.workBlock.findMany({
      where: { userId, status: 'rolled_over', rolledToDate: date, companyId: { in: companyIds } },
    })

    const scored: ScoredCompany[] = companies.map((company) => {
      const ideasNew = ideas.filter((i) => i.companyId === company.id && i.status === 'idea')
      const ideasInProgress = ideas.filter((i) => i.companyId === company.id && i.status === 'in_progress')
      const carryover = carryoverBlocks.filter((b) => b.companyId === company.id)
      const raw = ideasNew.length * 2 + ideasInProgress.length * 3 + carryover.length * 4
      return { company, score: raw * company.strategicWeight, ideasNew, ideasInProgress, carryover }
    })

    const positive = scored.filter((s) => s.score > 0)
    const targets = (positive.length > 0 ? positive : scored)
      .slice()
      .sort((a, b) => b.score - a.score || b.company.strategicWeight - a.company.strategicWeight)

    // 5. Pick the work slots that cover the requested hours (in order), then split each
    //    slot into one or two company block-slots depending on its length.
    const selectedSlots: { start: string; end: string }[] = []
    let covered = 0
    for (const slot of WORK_SLOTS) {
      if (covered >= availableHours) break
      selectedSlots.push(slot)
      covered += hoursBetween(slot.start, slot.end)
    }

    const blockSlots: { start: string; end: string }[] = []
    for (const slot of selectedSlots) {
      const parts = hoursBetween(slot.start, slot.end) >= 2 ? 2 : 1
      blockSlots.push(...splitSlot(slot.start, slot.end, parts))
    }

    // 6. Assign companies (by score) to block-slots, rotating through ideas per company.
    const ideaCursor = new Map<string, number>()
    const planned: PlannedSlot[] = blockSlots.map((bs, i) => {
      const target = targets[i % targets.length]
      const queue = [...target.ideasInProgress, ...target.ideasNew]
      const idx = ideaCursor.get(target.company.id) ?? 0
      const idea = queue[idx] ?? queue[0] ?? null
      ideaCursor.set(target.company.id, idx + 1)
      return {
        start: bs.start,
        end: bs.end,
        durationHours: Math.round(hoursBetween(bs.start, bs.end) * 100) / 100,
        target,
        linkedIdeaId: idea?.id ?? null,
      }
    })

    // 7. AI-generate content for each company block-slot in parallel (graceful fallback inside).
    const contents = await Promise.all(
      planned.map((p) =>
        generateBlockContent({
          companyName: p.target.company.name,
          durationHours: p.durationHours,
          startTime: p.start,
          endTime: p.end,
          ideasInProgress: p.target.ideasInProgress.map((i) => i.title),
          ideasPending: p.target.ideasNew.map((i) => i.title),
          defaultBlockType: p.target.ideasInProgress.length > 0 || p.target.ideasNew.length > 0 ? 'marketing' : 'admin',
        }),
      ),
    )

    // 8. Build the fixed routine blocks (always present, immutable).
    const forexCo = await ensureSystemCompany(userId, FOREX_COMPANY_NAME, '📈', '#14b8a6')
    const personalCo = await ensureSystemCompany(userId, PERSONAL_COMPANY_NAME, '🌿', '#71717a')

    const blockData: Prisma.WorkBlockCreateManyDailyPlanInput[] = []

    for (const fb of FIXED_BLOCKS) {
      const co = fb.type === 'forex' ? forexCo : personalCo
      blockData.push({
        userId,
        companyId: co.id,
        title: fb.title,
        description: null,
        startTime: fb.start,
        endTime: fb.end,
        durationHours: Math.round(hoursBetween(fb.start, fb.end) * 100) / 100,
        blockType: fb.type,
        status: 'pending',
        isFixed: true,
        rolledFromDate: null,
        linkedIdeaId: null,
      })
    }

    // 9. Company work blocks.
    planned.forEach((p, i) => {
      const c = contents[i]
      const hasCarryover = p.target.carryover.length > 0
      const description = encodeBlockDetails({
        description: hasCarryover
          ? `${c.description} (incluye ${p.target.carryover.length} bloque(s) acumulado(s))`
          : c.description,
        steps: c.steps,
      })
      blockData.push({
        userId,
        companyId: p.target.company.id,
        title: c.title,
        description,
        startTime: p.start,
        endTime: p.end,
        durationHours: p.durationHours,
        blockType: c.blockType,
        status: 'pending',
        isFixed: false,
        rolledFromDate: hasCarryover ? p.target.carryover[0].rolledFromDate ?? date : null,
        linkedIdeaId: p.linkedIdeaId,
      })
    })

    // 10. Persist DayStatus + DailyPlan + blocks.
    const dayStatus = await prisma.dayStatus.upsert({
      where: { userId_date: { userId, date } },
      update: { availableHours },
      create: { userId, date, status: 'normal', availableHours },
    })

    const plan = await prisma.dailyPlan.create({
      data: {
        userId,
        date,
        dayStatusId: dayStatus.id,
        status: 'pending',
        workBlocks: { createMany: { data: blockData } },
      },
      include: {
        workBlocks: { include: { company: true }, orderBy: { startTime: 'asc' } },
        dayStatus: true,
      },
    })

    return NextResponse.json(plan, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al generar el plan' }, { status: 500 })
  }
}

/** Delete the plan for a given date so it can be regenerated. Keeps the DayStatus. */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  try {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date')
    if (!dateStr) return NextResponse.json({ error: 'Parámetro date requerido' }, { status: 400 })

    const date = parseDateOnly(dateStr)
    await prisma.dailyPlan.deleteMany({ where: { userId, date } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Error al eliminar el plan' }, { status: 500 })
  }
}
