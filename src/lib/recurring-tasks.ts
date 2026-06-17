export type RecurringRule = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export function generateNextOccurrences(
  baseDate: Date,
  rule: RecurringRule,
  endDate: Date,
  daysToGenerate = 30,
): Date[] {
  const results: Date[] = []
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + daysToGenerate)

  const stepDays: Record<RecurringRule, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 14,
    monthly: 0,
  }

  let cursor = new Date(baseDate)

  // Advance cursor past today if baseDate is in the past
  while (cursor <= now) {
    cursor = addInterval(cursor, rule, stepDays[rule])
  }

  while (cursor <= cutoff && cursor <= endDate && results.length < 30) {
    results.push(new Date(cursor))
    cursor = addInterval(cursor, rule, stepDays[rule])
  }

  return results
}

function addInterval(date: Date, rule: RecurringRule, days: number): Date {
  const next = new Date(date)
  if (rule === 'monthly') {
    next.setMonth(next.getMonth() + 1)
  } else {
    next.setDate(next.getDate() + days)
  }
  return next
}
