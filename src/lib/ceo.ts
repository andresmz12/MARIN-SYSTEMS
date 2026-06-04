import { z } from 'zod'

// ──────────────────────── Constants ────────────────────────

export const IDEA_TYPES = ['reel', 'post', 'email', 'campaign', 'video', 'story', 'other'] as const
export const IDEA_STATUSES = ['idea', 'in_progress', 'done', 'discarded'] as const
export const DAY_STATUSES = ['normal', 'sick', 'travel', 'intensive', 'off'] as const
export const BLOCK_TYPES = ['work', 'marketing', 'admin', 'sales', 'forex', 'personal', 'deepwork'] as const
export const BLOCK_STATUSES = ['pending', 'done', 'skipped', 'rolled_over'] as const

/** Day statuses that trigger a rollover of pending blocks to the next work day. */
export const ROLLOVER_STATUSES: readonly string[] = ['sick', 'travel', 'off']

/** Block types the AI may assign to a generated company work block. */
export const AI_BLOCK_TYPES: readonly string[] = ['marketing', 'sales', 'admin', 'deepwork']

/** 8 predefined company colors used across the module. */
export const CEO_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6',
  '#ec4899', '#f97316', '#ef4444', '#14b8a6',
] as const

/** Name of the system pseudo-company used for the fixed daily Forex block. */
export const FOREX_COMPANY_NAME = 'Forex'

/** Name of the system pseudo-company used for fixed personal-routine blocks. */
export const PERSONAL_COMPANY_NAME = 'Personal'

// ──────────────────────── Fixed daily routine ────────────────────────

/** Immutable daily routine — these blocks always appear and cannot be done/skipped/rolled. */
export const FIXED_BLOCKS = [
  { start: '07:00', end: '07:30', title: '🐾 Mascota + despertar', type: 'personal' },
  { start: '07:30', end: '08:00', title: '🍳 Desayuno', type: 'personal' },
  { start: '08:00', end: '09:00', title: '📈 Forex - Sesión NY', type: 'forex' },
  { start: '10:00', end: '10:15', title: '☕ Pausa', type: 'personal' },
  { start: '12:30', end: '13:30', title: '🍽️ Almuerzo', type: 'personal' },
  { start: '15:30', end: '17:00', title: '🏋️ Gimnasio', type: 'personal' },
] as const

/** Time windows where dynamic company work blocks may be placed (ordered by preference). */
export const WORK_SLOTS = [
  { start: '09:00', end: '10:00' }, // 1h
  { start: '10:15', end: '12:30' }, // 2.25h
  { start: '13:30', end: '15:30' }, // 2h
  { start: '17:00', end: '19:00' }, // 2h opcional
] as const

export type IdeaType = (typeof IDEA_TYPES)[number]
export type IdeaStatus = (typeof IDEA_STATUSES)[number]
export type DayStatusValue = (typeof DAY_STATUSES)[number]
export type BlockType = (typeof BLOCK_TYPES)[number]
export type BlockStatus = (typeof BLOCK_STATUSES)[number]

// ──────────────────────── Date helpers (UTC, date-only) ────────────────────────

/** Parse a `YYYY-MM-DD` string into a UTC-midnight Date suitable for @db.Date columns. */
export function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`)
}

/** Format a Date into a `YYYY-MM-DD` key (UTC). */
export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Returns the next business day (skipping Saturday and Sunday) after `from`. */
export function nextWorkDay(from: Date): Date {
  const d = new Date(from)
  do {
    d.setUTCDate(d.getUTCDate() + 1)
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6)
  return d
}

/** Add `n` minutes to a `HH:MM` time string, returning a new `HH:MM` string. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Convert a `HH:MM` string into minutes-since-midnight. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Whole minutes between two `HH:MM` strings (end − start). */
export function minutesBetween(start: string, end: string): number {
  return toMinutes(end) - toMinutes(start)
}

/** Fractional hours between two `HH:MM` strings. */
export function hoursBetween(start: string, end: string): number {
  return minutesBetween(start, end) / 60
}

/** True when a UTC date-only value falls on Saturday or Sunday. */
export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/** Split a `[start,end]` window into `n` equal back-to-back sub-windows. */
export function splitSlot(start: string, end: string, n: number): { start: string; end: string }[] {
  if (n <= 1) return [{ start, end }]
  const total = minutesBetween(start, end)
  const step = Math.round(total / n)
  const parts: { start: string; end: string }[] = []
  let cur = start
  for (let i = 0; i < n; i++) {
    const next = i === n - 1 ? end : addMinutes(cur, step)
    parts.push({ start: cur, end: next })
    cur = next
  }
  return parts
}

// ──────────────────────── Block details (description + steps) ────────────────────────

export interface BlockDetails {
  description: string
  steps: string[]
}

/** Encode a block's description + steps into the single `description` column as JSON. */
export function encodeBlockDetails(d: BlockDetails): string {
  return JSON.stringify(d)
}

/** Decode the `description` column. Falls back to treating legacy plain text as the description. */
export function decodeBlockDetails(raw: string | null | undefined): BlockDetails {
  if (!raw) return { description: '', steps: [] }
  try {
    const p: unknown = JSON.parse(raw)
    if (p && typeof p === 'object' && ('description' in p || 'steps' in p)) {
      const obj = p as Record<string, unknown>
      return {
        description: typeof obj.description === 'string' ? obj.description : '',
        steps: Array.isArray(obj.steps) ? obj.steps.filter((s): s is string => typeof s === 'string') : [],
      }
    }
  } catch {
    // legacy plain-text description
  }
  return { description: raw, steps: [] }
}

// ──────────────────────── Zod schemas ────────────────────────

const dateOnlyString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha debe ser YYYY-MM-DD')

export const CEOCompanyCreateSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional(),
  emoji: z.string().min(1).max(10).optional(),
  country: z.array(z.string().max(8)).optional().default([]),
  strategicWeight: z.number().int().min(1).max(5).optional(),
  isActive: z.boolean().optional(),
})

export const CEOCompanyUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional(),
  emoji: z.string().min(1).max(10).optional(),
  country: z.array(z.string().max(8)).optional(),
  strategicWeight: z.number().int().min(1).max(5).optional(),
  isActive: z.boolean().optional(),
})

export const MarketingIdeaCreateSchema = z.object({
  companyId: z.string().min(1, 'Empresa requerida'),
  title: z.string().min(1, 'Título requerido').max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(IDEA_TYPES),
  status: z.enum(IDEA_STATUSES).optional(),
  priority: z.number().int().min(1).max(5).optional(),
})

export const MarketingIdeaUpdateSchema = z.object({
  companyId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(IDEA_TYPES).optional(),
  status: z.enum(IDEA_STATUSES).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  convertedToTask: z.boolean().optional(),
  scheduledDate: z.string().nullable().optional(),
})

export const DayStatusUpsertSchema = z.object({
  date: dateOnlyString,
  status: z.enum(DAY_STATUSES).optional(),
  availableHours: z.number().min(0).max(16).optional(),
  note: z.string().max(500).nullable().optional(),
})

export const GeneratePlanSchema = z.object({
  date: dateOnlyString,
  availableHours: z.number().min(1).max(16),
})

export const WorkBlockUpdateSchema = z.object({
  status: z.enum(BLOCK_STATUSES).optional(),
  description: z.string().max(2000).nullable().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
})
