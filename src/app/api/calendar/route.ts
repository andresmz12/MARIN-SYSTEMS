import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

function escapeIcs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function toIcsDate(date: Date, time?: string | null): { value: string; allDay: boolean } {
  if (time) {
    const [h, m] = time.split(':').map(Number)
    // Events stored in UTC-5 (Bogotá), convert to UTC for ICS
    const d = new Date(date)
    d.setUTCHours(h + 5, m, 0, 0)
    const str = d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
    return { value: str, allDay: false }
  }
  const str = date.toISOString().split('T')[0].replace(/-/g, '')
  return { value: str, allDay: true }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return new NextResponse('Token requerido', { status: 401 })

  const user = await prisma.user.findUnique({
    where: { calendarToken: token },
    include: { events: { orderBy: { date: 'asc' } } },
  })

  if (!user) return new NextResponse('Token inválido', { status: 401 })

  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Marin Systems//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Marin Systems',
    'X-WR-TIMEZONE:America/Bogota',
    'X-WR-CALDESC:Agenda de trading y productividad',
  ]

  for (const event of user.events) {
    const { value: dtstart, allDay } = toIcsDate(event.date, event.time)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.id}@marin-systems`)
    lines.push(`DTSTAMP:${now}`)

    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${dtstart}`)
      // All-day end = next day
      const next = new Date(event.date)
      next.setUTCDate(next.getUTCDate() + 1)
      lines.push(`DTEND;VALUE=DATE:${next.toISOString().split('T')[0].replace(/-/g, '')}`)
    } else {
      lines.push(`DTSTART:${dtstart}`)
      // Default 1 hour duration
      const [h, m] = (event.time as string).split(':').map(Number)
      const endD = new Date(event.date)
      endD.setUTCHours(h + 5 + 1, m, 0, 0)
      lines.push(`DTEND:${endD.toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`)

      // Recordatorio 30 min antes
      lines.push('BEGIN:VALARM')
      lines.push('TRIGGER:-PT30M')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:Recordatorio: ${escapeIcs(event.title)}`)
      lines.push('END:VALARM')
    }

    let summary = event.title
    if (event.isForexNews && event.forexPair) summary += ` (Forex: ${event.forexPair})`
    lines.push(`SUMMARY:${escapeIcs(summary)}`)

    if (event.notes) lines.push(`DESCRIPTION:${escapeIcs(event.notes)}`)

    const categoryMap: Record<string, string> = {
      personal: 'PERSONAL',
      trading: 'BUSINESS',
      aprendizaje: 'EDUCATION',
      otro: 'MISCELLANEOUS',
    }
    lines.push(`CATEGORIES:${categoryMap[event.type] ?? 'MISCELLANEOUS'}`)

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    },
  })
}
