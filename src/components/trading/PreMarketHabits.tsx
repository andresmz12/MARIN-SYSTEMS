'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Habit {
  id: string
  name: string
  emoji: string
  isPreMarket: boolean
}

interface Completion {
  habitId: string
}

export function PreMarketHabits() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    try {
      const [habitsRes, completionsRes] = await Promise.all([
        fetch('/api/habits'),
        fetch(`/api/habits/complete?date=${today}`),
      ])
      if (habitsRes.ok) setHabits(await habitsRes.json())
      if (completionsRes.ok) setCompletions(await completionsRes.json())
    } catch {
      // Si falla, la tarjeta simplemente queda vacía — no bloquea el resto de Mi Sistema.
    } finally {
      setLoading(false)
    }
  }

  async function toggleHabit(habitId: string) {
    const isDone = completions.some((c) => c.habitId === habitId)
    setCompletions((prev) => (isDone ? prev.filter((c) => c.habitId !== habitId) : [...prev, { habitId }]))
    try {
      await fetch('/api/habits/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitId, date: today }),
      })
    } catch {
      setCompletions((prev) => (isDone ? [...prev, { habitId }] : prev.filter((c) => c.habitId !== habitId)))
    }
  }

  const preMarket = habits.filter((h) => h.isPreMarket)
  const doneCount = preMarket.filter((h) => completions.some((c) => c.habitId === h.id)).length

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-semibold text-white text-sm">🌅 Rutina Matutina</p>
          <p className="text-xs text-gray-500">
            {preMarket.length > 0 ? `${doneCount}/${preMarket.length} completados hoy` : 'Hábitos marcados como pre-mercado'}
          </p>
        </div>
        <Link href="/habitos" className="text-xs text-blue-400 hover:text-blue-300">Gestionar hábitos →</Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-9 bg-[#1a1a1a] animate-pulse rounded-lg" />)}
        </div>
      ) : preMarket.length === 0 ? (
        <p className="text-sm text-gray-600">
          No tienes hábitos marcados como pre-mercado todavía.{' '}
          <Link href="/habitos" className="text-blue-400 hover:text-blue-300">Crea uno →</Link>
        </p>
      ) : (
        <div className="space-y-2">
          {preMarket.map((habit) => {
            const isDone = completions.some((c) => c.habitId === habit.id)
            return (
              <label
                key={habit.id}
                className="flex items-center gap-3 cursor-pointer group"
                onClick={() => toggleHabit(habit.id)}
              >
                <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  isDone
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-[#3a3a3a] group-hover:border-blue-600/50'
                }`}>
                  {isDone && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-base leading-none">{habit.emoji}</span>
                <span className={`text-sm transition-colors ${
                  isDone ? 'text-gray-500 line-through' : 'text-gray-300 group-hover:text-white'
                }`}>
                  {habit.name}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
