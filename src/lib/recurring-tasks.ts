export type RecurringRule = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export function generateNextOccurrences(
  baseDate: Date,
  rule: RecurringRule,
  endDate: Date,
  daysToGenerate = 30,
): Date[] {
  const occurrences: Date[] = []
  let current = new Date(baseDate)
  const now = new Date()

  while (current <= endDate && occurrences.length < daysToGenerate) {
    if (current >= now) {
      occurrences.push(new Date(current))
    }

    switch (rule) {
      case 'daily':
        current.setDate(current.getDate() + 1)
        break
      case 'weekly':
        current.setDate(current.getDate() + 7)
        break
      case 'biweekly':
        current.setDate(current.getDate() + 14)
        break
      case 'monthly':
        current.setMonth(current.getMonth() + 1)
        break
    }
  }

  return occurrences
}
