// Client-side helpers + display config for the CEO Command Center.

/** `YYYY-MM-DD` key for a local Date (no UTC shift). */
export function toKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey(): string {
  return toKey(new Date())
}

/** Parse a `YYYY-MM-DD` key to a local Date at noon (avoids TZ off-by-one). */
export function fromKey(key: string): Date {
  return new Date(`${key}T12:00:00`)
}

/** Monday of the week containing `key`. */
export function weekStartKey(key: string): string {
  const d = fromKey(key)
  const dow = d.getDay() // 0 = Sun
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return toKey(d)
}

export function addDaysKey(key: string, n: number): string {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "Viernes, 30 de Mayo" */
export function formatLong(key: string): string {
  const d = fromKey(key)
  const weekday = cap(new Intl.DateTimeFormat('es', { weekday: 'long' }).format(d))
  const day = d.getDate()
  const month = cap(new Intl.DateTimeFormat('es', { month: 'long' }).format(d))
  return `${weekday}, ${day} de ${month}`
}

/** "Lun 30" */
export function formatShort(key: string): string {
  const d = fromKey(key)
  const weekday = cap(new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d).replace('.', ''))
  return `${weekday} ${d.getDate()}`
}

// ──────────────────────── Day status config ────────────────────────

export interface DayStatusConfig {
  value: string
  label: string
  emoji: string
  /** Tailwind classes for the active/selected pill. */
  active: string
  dot: string
}

export const DAY_STATUS_CONFIG: DayStatusConfig[] = [
  { value: 'normal', label: 'Normal', emoji: '💪', active: 'bg-zinc-700 text-white border-zinc-500', dot: 'bg-zinc-400' },
  { value: 'sick', label: 'Enfermo', emoji: '🤒', active: 'bg-red-500/20 text-red-400 border-red-500/50', dot: 'bg-red-500' },
  { value: 'travel', label: 'Viaje', emoji: '✈️', active: 'bg-blue-500/20 text-blue-400 border-blue-500/50', dot: 'bg-blue-500' },
  { value: 'intensive', label: 'Intensivo', emoji: '⚡', active: 'bg-amber-500/20 text-amber-400 border-amber-500/50', dot: 'bg-amber-500' },
  { value: 'off', label: 'Día libre', emoji: '🚫', active: 'bg-zinc-600/30 text-zinc-400 border-zinc-600', dot: 'bg-zinc-600' },
]

export function dayStatusConfig(value: string | undefined | null): DayStatusConfig {
  return DAY_STATUS_CONFIG.find((c) => c.value === value) ?? DAY_STATUS_CONFIG[0]
}

// ──────────────────────── Idea config ────────────────────────

export const IDEA_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  reel: { label: 'Reel', cls: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
  post: { label: 'Post', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  email: { label: 'Email', cls: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
  campaign: { label: 'Campaña', cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40' },
  video: { label: 'Video', cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  story: { label: 'Story', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  other: { label: 'Otro', cls: 'bg-zinc-600/30 text-zinc-400 border-zinc-600' },
}

export const IDEA_TYPE_OPTIONS = [
  { value: 'reel', label: 'Reel' },
  { value: 'post', label: 'Post' },
  { value: 'email', label: 'Email' },
  { value: 'campaign', label: 'Campaña' },
  { value: 'video', label: 'Video' },
  { value: 'story', label: 'Story' },
  { value: 'other', label: 'Otro' },
]

export const IDEA_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  idea: { label: 'Idea', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  in_progress: { label: 'En progreso', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  done: { label: 'Listo', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  discarded: { label: 'Descartada', cls: 'bg-zinc-600/30 text-zinc-400 border-zinc-600' },
}

// ──────────────────────── Block config ────────────────────────

export const BLOCK_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  work: { label: 'Trabajo', cls: 'bg-zinc-600/30 text-zinc-300 border-zinc-600' },
  marketing: { label: 'Marketing', cls: 'bg-pink-500/20 text-pink-400 border-pink-500/40' },
  admin: { label: 'Admin', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
  sales: { label: 'Ventas', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  forex: { label: 'Forex', cls: 'bg-teal-500/20 text-teal-400 border-teal-500/40' },
}

export const BLOCK_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-zinc-600/30 text-zinc-400 border-zinc-600' },
  done: { label: 'Hecho', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  skipped: { label: 'Saltado', cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  rolled_over: { label: 'Acumulado', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
}

export const CEO_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#3b82f6',
  '#ec4899', '#f97316', '#ef4444', '#14b8a6',
]

export function flag(country: string): string {
  const map: Record<string, string> = { US: '🇺🇸', CO: '🇨🇴', MX: '🇲🇽', ES: '🇪🇸' }
  return map[country] ?? country
}
