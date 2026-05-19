'use client'

import { useEffect } from 'react'

interface Event {
  id: string
  title: string
  date: string
  time: string | null
  completed?: boolean
}

export function DayNotifier() {
  useEffect(() => {
    let timeouts: ReturnType<typeof setTimeout>[] = []

    async function init() {
      if (!('Notification' in window)) return

      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()

      if (permission !== 'granted') return

      const today = new Date().toISOString().slice(0, 10)
      let events: Event[] = []

      try {
        const res = await fetch(`/api/events?from=${today}&to=${today}`)
        if (!res.ok) return
        events = await res.json()
      } catch {
        return
      }

      const now = Date.now()

      for (const event of events) {
        if (!event.time || event.completed) continue

        // Parse HH:MM from event.time
        const match = event.time.match(/^(\d{1,2}):(\d{2})/)
        if (!match) continue

        const [, hh, mm] = match
        const eventDate = new Date()
        eventDate.setHours(Number(hh), Number(mm), 0, 0)
        const eventMs = eventDate.getTime()

        const diffMs = eventMs - now
        const thirtyMin = 30 * 60 * 1000

        // Notify 30 minutes before if we haven't passed that point yet
        const notifyAt = diffMs - thirtyMin
        if (notifyAt > 0) {
          const t = setTimeout(() => {
            new Notification(`Pronto: ${event.title}`, {
              body: `Comienza a las ${event.time} (en 30 minutos)`,
              icon: '/icon-192.png',
            })
          }, notifyAt)
          timeouts.push(t)
        }

        // Also notify exactly at event time if it's in the future
        if (diffMs > 0) {
          const t = setTimeout(() => {
            new Notification(event.title, {
              body: `Ahora · ${event.time}`,
              icon: '/icon-192.png',
            })
          }, diffMs)
          timeouts.push(t)
        }
      }
    }

    init()

    return () => {
      timeouts.forEach(clearTimeout)
    }
  }, [])

  return null
}
