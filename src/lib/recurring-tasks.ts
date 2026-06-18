export type RecurringRule = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export function generateDailyInstancesForTask(createdDate: Date, dueDate: Date): Date[] {
  const instances: Date[] = []
  const current = new Date(createdDate)
  current.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)

  while (current <= due) {
    instances.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  console.log(`[RECURRING] Instancias diarias generadas: ${instances.length} (${current.toISOString().slice(0, 10)} → ${due.toISOString().slice(0, 10)})`)
  return instances
}

export function generateRecurringOccurrences(
  baseDate: Date,
  rule: RecurringRule,
  endDate: Date,
): Date[] {
  const occurrences: Date[] = []
  const current = new Date(baseDate)
  current.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)

  while (current <= end) {
    occurrences.push(new Date(current))
    switch (rule) {
      case 'daily':    current.setDate(current.getDate() + 1);     break
      case 'weekly':   current.setDate(current.getDate() + 7);     break
      case 'biweekly': current.setDate(current.getDate() + 14);    break
      case 'monthly':  current.setMonth(current.getMonth() + 1);   break
    }
  }

  return occurrences
}

export function generateRecurringInstances(
  baseDate: Date,
  dueDate: Date,
  rule: RecurringRule,
  endDate: Date,
): Date[] {
  const allInstances: Date[] = []
  const occurrences = generateRecurringOccurrences(baseDate, rule, endDate)

  const dueOffset = new Date(dueDate)
  dueOffset.setHours(0, 0, 0, 0)
  const base = new Date(baseDate)
  base.setHours(0, 0, 0, 0)
  // How many days from baseDate to dueDate (the "window" per occurrence)
  const windowDays = Math.max(0, Math.round((dueOffset.getTime() - base.getTime()) / 86400000))

  for (const occurrence of occurrences) {
    const current = new Date(occurrence)
    current.setHours(0, 0, 0, 0)
    for (let d = 0; d <= windowDays; d++) {
      allInstances.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
  }

  console.log(`[RECURRING] Instancias recurrentes (${rule}): ${allInstances.length} desde ${occurrences.length} ocurrencias, ventana=${windowDays}d`)
  return allInstances
}

// Keep old export name for cron/generate compatibility
export const generateNextOccurrences = generateRecurringOccurrences
