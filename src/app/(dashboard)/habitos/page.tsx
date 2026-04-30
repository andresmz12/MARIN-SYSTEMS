'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { formatInTimeZone } from 'date-fns-tz'

interface Habit {
  id: string
  name: string
  emoji: string
  category: string
  frequency: string
  isPreMarket: boolean
}

interface Completion {
  id: string
  habitId: string
  date: string
}

interface HabitHistory {
  habitId: string
  date: string
}

const CATEGORIES = ['trading', 'salud', 'personal', 'aprendizaje']
const CATEGORY_COLORS: Record<string, string> = {
  trading: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  salud: 'bg-green-500/20 text-green-400 border-green-500/30',
  personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  aprendizaje: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

const emptyForm = {
  name: '',
  emoji: '⭐',
  category: 'trading',
  frequency: 'diario',
  isPreMarket: false,
}

function generateLast84Days(): string[] {
  const days: string[] = []
  for (let i = 83; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function HabitosPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<Completion[]>([])
  const [history, setHistory] = useState<HabitHistory[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editHabit, setEditHabit] = useState<Habit | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const today = new Date().toISOString().split('T')[0]
  const days84 = generateLast84Days()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [habitsRes, completionsRes, historyRes] = await Promise.all([
      fetch('/api/habits'),
      fetch(`/api/habits/complete?date=${today}`),
      fetch('/api/habits/history'),
    ])
    if (habitsRes.ok) setHabits(await habitsRes.json())
    if (completionsRes.ok) setCompletions(await completionsRes.json())
    if (historyRes.ok) setHistory(await historyRes.json())
  }

  async function toggleHabit(habitId: string) {
    await fetch('/api/habits/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ habitId, date: today }),
    })
    loadData()
  }

  function openCreate() {
    setEditHabit(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(habit: Habit) {
    setEditHabit(habit)
    setForm({
      name: habit.name,
      emoji: habit.emoji,
      category: habit.category,
      frequency: habit.frequency,
      isPreMarket: habit.isPreMarket,
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    if (editHabit) {
      await fetch(`/api/habits/${editHabit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } else {
      await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    setLoading(false)
    setModalOpen(false)
    loadData()
  }

  async function deleteHabit(id: string) {
    if (!confirm('¿Eliminar este hábito y todo su historial?')) return
    await fetch(`/api/habits/${id}`, { method: 'DELETE' })
    loadData()
  }

  function computeStreak(habitId: string): number {
    const habitDates = history
      .filter((h) => h.habitId === habitId)
      .map((h) => h.date.split('T')[0])
      .sort((a, b) => b.localeCompare(a))

    if (!habitDates.length) return 0
    const todayCompleted = completions.some((c) => c.habitId === habitId)
    const reference = todayCompleted ? today : (() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return d.toISOString().split('T')[0]
    })()
    if (habitDates[0] !== reference && habitDates[0] !== today) return 0

    let streak = 0
    let current = new Date(habitDates[0])
    for (const dateStr of habitDates) {
      const d = new Date(dateStr)
      const diff = Math.round((current.getTime() - d.getTime()) / 86400000)
      if (diff <= 1) {
        streak++
        current = d
      } else break
    }
    return streak
  }

  const filtered = selectedCategory === 'all' ? habits : habits.filter((h) => h.category === selectedCategory)
  const completedCount = completions.length
  const totalHabits = habits.filter((h) => h.frequency === 'diario').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hábitos</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {completedCount}/{totalHabits} completados hoy
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo hábito
        </button>
      </div>

      {/* Progress bar */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Progreso de hoy</span>
          <span className="text-sm font-semibold text-white">
            {totalHabits > 0 ? Math.round((completedCount / totalHabits) * 100) : 0}%
          </span>
        </div>
        <div className="w-full bg-[#111] rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${totalHabits > 0 ? (completedCount / totalHabits) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selectedCategory === 'all'
              ? 'bg-gray-500/20 text-gray-300 border-gray-500/40'
              : 'text-gray-600 border-[#2a2a2a] hover:text-gray-400'
          }`}
        >
          Todos
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${
              selectedCategory === cat
                ? CATEGORY_COLORS[cat]
                : 'text-gray-600 border-[#2a2a2a] hover:text-gray-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Habits List */}
      {filtered.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600 text-sm">No hay hábitos. ¡Crea el primero!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((habit) => {
            const isDone = completions.some((c) => c.habitId === habit.id)
            const streak = computeStreak(habit.id)
            const habitHistory = history.filter((h) => h.habitId === habit.id).map((h) => h.date.split('T')[0])

            return (
              <div key={habit.id} className="card flex items-start gap-4">
                {/* Toggle */}
                <button
                  onClick={() => toggleHabit(habit.id)}
                  className={`mt-0.5 w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isDone
                      ? 'bg-green-500 border-green-500'
                      : 'border-[#3a3a3a] hover:border-green-500'
                  }`}
                >
                  {isDone && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{habit.emoji}</span>
                    <span className={`font-medium text-sm ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {habit.name}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[habit.category]}`}>
                      {habit.category}
                    </span>
                    {habit.isPreMarket && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                        pre-mercado
                      </span>
                    )}
                  </div>

                  {/* Contribution mini-graph */}
                  <div className="mt-2 flex gap-0.5 flex-wrap" style={{ maxWidth: '420px' }}>
                    {days84.slice(-28).map((day) => {
                      const done = habitHistory.includes(day) || (day === today && isDone)
                      return (
                        <div
                          key={day}
                          title={day}
                          className={`w-3 h-3 rounded-sm ${done ? 'bg-green-500' : 'bg-[#222]'}`}
                        />
                      )
                    })}
                  </div>
                </div>

                {/* Streak + Actions */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {streak > 0 && (
                    <div className="text-center">
                      <p className="text-sm font-bold text-orange-400">{streak}</p>
                      <p className="text-[10px] text-gray-600">racha</p>
                    </div>
                  )}
                  <button
                    onClick={() => openEdit(habit)}
                    className="text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteHabit(habit.id)}
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 12-Week Contribution Graph */}
      {habits.length > 0 && (
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Historial de completados — últimas 12 semanas</p>
          <div className="overflow-x-auto">
            <div className="flex gap-1">
              {Array.from({ length: 12 }, (_, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const dayOffset = (11 - weekIdx) * 7 + (6 - dayIdx)
                    const d = new Date()
                    d.setDate(d.getDate() - dayOffset)
                    const dateStr = d.toISOString().split('T')[0]
                    const completedHabits = habits.filter((h) =>
                      history.some((hist) => hist.habitId === h.id && hist.date.startsWith(dateStr))
                    ).length
                    const pct = habits.length > 0 ? completedHabits / habits.length : 0
                    const bg = pct === 0 ? 'bg-[#1f1f1f]'
                      : pct < 0.33 ? 'bg-green-900'
                      : pct < 0.66 ? 'bg-green-700'
                      : pct < 1 ? 'bg-green-500'
                      : 'bg-green-400'
                    return (
                      <div
                        key={dayIdx}
                        className={`w-3.5 h-3.5 rounded-sm ${bg}`}
                        title={`${dateStr}: ${completedHabits}/${habits.length} hábitos`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs text-gray-600">Menos</span>
            {['bg-[#1f1f1f]', 'bg-green-900', 'bg-green-700', 'bg-green-500', 'bg-green-400'].map((c, i) => (
              <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
            ))}
            <span className="text-xs text-gray-600">Más</span>
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editHabit ? 'Editar hábito' : 'Nuevo hábito'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Emoji</label>
              <input
                type="text"
                className="input text-center text-lg"
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                maxLength={2}
              />
            </div>
            <div className="col-span-3">
              <label className="label">Nombre del hábito</label>
              <input
                type="text"
                className="input"
                placeholder="Ej: Hacer ejercicio"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Frecuencia</label>
              <select
                className="input"
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}
              >
                <option value="diario">Diario</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPreMarket}
              onChange={(e) => setForm({ ...form, isPreMarket: e.target.checked })}
              className="w-4 h-4 rounded accent-orange-500"
            />
            <span className="text-sm text-gray-300">Es parte de la rutina pre-mercado</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Guardando...' : editHabit ? 'Actualizar' : 'Crear hábito'}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
