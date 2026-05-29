import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  GeneratePlanSchema, FOREX_COMPANY_NAME, parseDateOnly, addMinutes,
  type BlockType,
} from '@/lib/ceo'
import type { CEOCompany, MarketingIdea, WorkBlock, Prisma } from '@prisma/client'

const DAY_START = '06:00'
const MIN_HOURS = 0.5
const MAX_HOURS = 3
const FOREX_MIN_AVAILABLE = 4

interface ScoredCompany {
  company: CEOCompany
  score: number
  ideasNew: MarketingIdea[]
  ideasInProgress: MarketingIdea[]
  carryover: WorkBlock[]
}

function blockTypeForIdea(type: string): BlockType {
  if (['reel', 'post', 'video', 'story', 'campaign', 'email'].includes(type)) return 'marketing'
  return 'admin'
}

/** Distributes `pool` hours across items (ordered by priority) honouring min/max + redistribution. */
function allocateHours(items: { id: string; score: number }[], pool: number): Map<string, number> {
  const result = new Map<string, number>()
  if (items.length === 0 || pool <= 0) return result

  const useEqual = items.every((i) => i.score <= 0)
  const totalScore = items.reduce((s, i) => s + i.score, 0)

  let remaining = pool
  for (const i of items) {
    const share = useEqual ? pool / items.length : pool * (i.score / totalScore)
    let h = Math.min(MAX_HOURS, Math.max(MIN_HOURS, share))
    h = Math.round(h * 2) / 2
    result.set(i.id, h)
    remaining -= h
  }

  remaining = Math.round(remaining * 2) / 2
  let guard = 0
  while (Math.abs(remaining) >= 0.5 && guard < 200) {
    guard++
    if (remaining > 0) {
      const target = items.find((i) => (result.get(i.id) ?? 0) < MAX_HOURS)
      if (!target) break
      result.set(target.id, (result.get(target.id) ?? 0) + 0.5)
      remaining -= 0.5
    } else {
      const target = [...items].reverse().find((i) => (result.get(i.id) ?? 0) > MIN_HOURS)
      if (!target) break
      result.set(target.id, (result.get(target.id) ?? 0) - 0.5)
      remaining += 0.5
    }
  }

  return result
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

    // 1. Block if a plan already exists for this date.
    const existingPlan = await prisma.dailyPlan.findUnique({
      where: { userId_date: { userId, date } },
    })
    if (existingPlan) {
      return NextResponse.json({ error: 'Ya existe un plan para este día', canRegenerate: true }, { status: 409 })
    }

    // 2. Active companies (system Forex excluded).
    const companies = await prisma.cEOCompany.findMany({
      where: { userId, isActive: true, name: { not: FOREX_COMPANY_NAME } },
    })

    if (companies.length === 0) {
      return NextResponse.json({ error: 'No hay empresas activas para planificar' }, { status: 400 })
    }

    const companyIds = companies.map((c) => c.id)

    // 3. Ideas + carryover blocks for scoring.
    const ideas = await prisma.marketingIdea.findMany({
      where: { userId, companyId: { in: companyIds }, status: { in: ['idea', 'in_progress'] } },
    })
    const carryoverBlocks = await prisma.workBlock.findMany({
      where: { userId, status: 'rolled_over', rolledToDate: date, companyId: { in: companyIds } },
    })

    const scored: ScoredCompany[] = companies.map((company) => {
      const ideasNew = ideas.filter((i) => i.companyId === company.id && i.status === 'idea')
      const ideasInProgress = ideas.filter((i) => i.companyId === company.id && i.status === 'in_progress')
      const carryover = carryoverBlocks.filter((b) => b.companyId === company.id)
      const raw = ideasNew.length * 2 + ideasInProgress.length * 3 + carryover.length * 4
      return {
        company,
        score: raw * company.strategicWeight,
        ideasNew,
        ideasInProgress,
        carryover,
      }
    })

    // Companies with score drive the distribution; if none, fall back to equal weighting.
    const positive = scored.filter((s) => s.score > 0)
    const targets = (positive.length > 0 ? positive : scored)
      .slice()
      .sort((a, b) => b.score - a.score || b.company.strategicWeight - a.company.strategicWeight)

    // 4. Distribute hours (reserve 1h for the fixed Forex block when applicable).
    const includeForex = availableHours >= FOREX_MIN_AVAILABLE
    const pool = availableHours - (includeForex ? 1 : 0)
    const allocation = allocateHours(
      targets.map((t) => ({ id: t.company.id, score: t.score })),
      pool,
    )

    // 5. Build work blocks starting at 06:00, ordered by score desc.
    const blockData: Prisma.WorkBlockCreateManyDailyPlanInput[] = []
    let cursor = DAY_START

    for (const t of targets) {
      const hours = allocation.get(t.company.id) ?? 0
      if (hours <= 0) continue

      let title: string
      let blockType: BlockType
      let linkedIdeaId: string | null = null

      if (t.ideasInProgress.length > 0) {
        const idea = t.ideasInProgress[0]
        title = idea.title
        blockType = blockTypeForIdea(idea.type)
        linkedIdeaId = idea.id
      } else if (t.ideasNew.length > 0) {
        const idea = t.ideasNew[0]
        title = `Desarrollar: ${idea.title}`
        blockType = blockTypeForIdea(idea.type)
        linkedIdeaId = idea.id
      } else {
        title = `${t.company.name}: Operaciones y seguimiento`
        blockType = 'admin'
      }

      const end = addMinutes(cursor, hours * 60)
      const hasCarryover = t.carryover.length > 0

      blockData.push({
        userId,
        companyId: t.company.id,
        title,
        description: hasCarryover ? `Incluye ${t.carryover.length} bloque(s) acumulado(s) de días previos` : null,
        startTime: cursor,
        endTime: end,
        durationHours: hours,
        blockType,
        status: 'pending',
        rolledFromDate: hasCarryover ? t.carryover[0].rolledFromDate ?? date : null,
        linkedIdeaId,
      })
      cursor = end
    }

    // 6 (Forex). Ensure the system Forex company exists and append a fixed 1h block.
    if (includeForex) {
      let forex = await prisma.cEOCompany.findFirst({ where: { userId, name: FOREX_COMPANY_NAME } })
      if (!forex) {
        forex = await prisma.cEOCompany.create({
          data: { userId, name: FOREX_COMPANY_NAME, emoji: '📈', color: '#14b8a6', isActive: false, strategicWeight: 1, country: [] },
        })
      }
      const end = addMinutes(cursor, 60)
      blockData.push({
        userId,
        companyId: forex.id,
        title: 'Sesión de Forex',
        description: 'Bloque fijo diario de trading',
        startTime: cursor,
        endTime: end,
        durationHours: 1,
        blockType: 'forex',
        status: 'pending',
        rolledFromDate: null,
        linkedIdeaId: null,
      })
      cursor = end
    }

    // 7. Ensure DayStatus exists, then create the DailyPlan + blocks in a transaction.
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
