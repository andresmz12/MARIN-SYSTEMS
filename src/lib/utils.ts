import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { format, startOfDay } from 'date-fns'

export const TIMEZONE = 'America/Bogota'

export function getTodayInColombia(): Date {
  const now = new Date()
  const zoned = toZonedTime(now, TIMEZONE)
  return startOfDay(zoned)
}

export function getTodayString(): string {
  return formatInTimeZone(new Date(), TIMEZONE, 'yyyy-MM-dd')
}

export function formatDate(date: Date | string, fmt = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, TIMEZONE, fmt)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return formatInTimeZone(d, TIMEZONE, 'dd/MM/yyyy HH:mm')
}

export function getDayStart(dateStr?: string): Date {
  if (dateStr) {
    return new Date(`${dateStr}T00:00:00-05:00`)
  }
  const today = getTodayString()
  return new Date(`${today}T00:00:00-05:00`)
}

export function getDayEnd(dateStr?: string): Date {
  if (dateStr) {
    return new Date(`${dateStr}T23:59:59-05:00`)
  }
  const today = getTodayString()
  return new Date(`${today}T23:59:59-05:00`)
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export const MOTIVATIONAL_QUOTES = [
  'El trading no es sobre ser correcto, es sobre gestionar el riesgo.',
  'Sigue el plan, no las emociones.',
  'La disciplina es el puente entre tus metas y tus logros.',
  'Un buen trader no es el que nunca pierde, es el que sabe cuándo parar.',
  'El mercado siempre estará ahí mañana. Tu capital también debe estarlo.',
  'La paciencia es la virtud más rentable en el trading.',
  'Cada pérdida es una lección, cada ganancia es una confirmación.',
  'Tu mayor enemigo en el trading eres tú mismo.',
  'Protege tu capital primero. Las ganancias vendrán solas.',
  'Sé consistente, no perfecto.',
  'Un setup mediocre con gestión de riesgo excelente supera a un setup perfecto sin ella.',
  'El mercado recompensa la paciencia y castiga la impaciencia.',
]

export function getDailyQuote(): string {
  const today = new Date()
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000)
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length]
}

export function computeTrafficLight(mentalState: number, rutinaCompleted: boolean, hasNews: boolean): 'verde' | 'amarillo' | 'rojo' {
  if (mentalState >= 4 && rutinaCompleted && !hasNews) return 'verde'
  if (mentalState >= 3) return 'amarillo'
  return 'rojo'
}

export function computeStreak(dates: Date[]): number {
  if (!dates.length) return 0
  const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime())
  const today = getTodayString()
  const yesterday = formatInTimeZone(
    new Date(new Date().getTime() - 86400000),
    TIMEZONE,
    'yyyy-MM-dd'
  )

  const latestDate = formatInTimeZone(sorted[0], TIMEZONE, 'yyyy-MM-dd')
  if (latestDate !== today && latestDate !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const curr = formatInTimeZone(sorted[i - 1], TIMEZONE, 'yyyy-MM-dd')
    const prev = formatInTimeZone(sorted[i], TIMEZONE, 'yyyy-MM-dd')
    const diff = (new Date(curr).getTime() - new Date(prev).getTime()) / 86400000
    if (diff === 1) {
      streak++
    } else {
      break
    }
  }
  return streak
}
