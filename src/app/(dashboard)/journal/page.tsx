'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface JournalEntry {
  id: string
  date: string
  mood: number
  content: string
  tags: string[]
}

const MOOD_EMOJIS = ['', '😞', '😕', '😐', '🙂', '😄']
const MOOD_LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente']
const MOOD_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']

export default function JournalPage() {
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null>(null)
  const [monthEntries, setMonthEntries] = useState<JournalEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [mood, setMood] = useState(3)
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadTodayEntry()
  }, [])

  useEffect(() => {
    loadMonthEntries()
  }, [selectedMonth])

  async function loadTodayEntry() {
    const res = await fetch(`/api/journal?date=${today}`)
    if (res.ok) {
      const entries = await res.json()
      if (entries.length > 0) {
        setTodayEntry(entries[0])
        setMood(entries[0].mood)
        setContent(entries[0].content)
        setTags(entries[0].tags || [])
      } else {
        setEditing(true)
      }
    }
  }

  async function loadMonthEntries() {
    const res = await fetch(`/api/journal?month=${selectedMonth}`)
    if (res.ok) setMonthEntries(await res.json())
  }

  async function handleSave() {
    setLoading(true)
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, mood, content, tags }),
    })
    setLoading(false)
    setEditing(false)
    loadTodayEntry()
    loadMonthEntries()
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setTagInput('')
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag))
  }

  // Mood chart data for current month
  const moodChartData = [...monthEntries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({
      day: new Date(entry.date).getDate(),
      mood: entry.mood,
    }))

  const avgMood =
    monthEntries.length > 0
      ? Math.round((monthEntries.reduce((sum, e) => sum + e.mood, 0) / monthEntries.length) * 10) / 10
      : 0

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Journal</h1>
        <p className="text-gray-500 text-sm mt-0.5">Tu diario personal de trading y bienestar</p>
      </div>

      {/* Today's Entry */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-white text-sm">Entrada de hoy</p>
            <p className="text-xs text-gray-500">
              {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {todayEntry && !editing && (
            <button onClick={() => setEditing(true)} className="btn-secondary text-xs">
              Editar
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* Mood selector */}
            <div>
              <label className="label">¿Cómo te sientes hoy?</label>
              <div className="flex gap-2 mt-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMood(v)}
                    className={`flex-1 flex flex-col items-center py-2 rounded-lg border transition-all ${
                      mood === v
                        ? 'border-blue-500 bg-blue-600/10'
                        : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                    }`}
                  >
                    <span className="text-xl">{MOOD_EMOJIS[v]}</span>
                    <span className="text-[10px] text-gray-500 mt-0.5">{MOOD_LABELS[v]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="label">¿Cómo fue tu día? Qué aprendiste, qué sientes...</label>
              <textarea
                className="input resize-none"
                rows={6}
                placeholder="Escribe libremente sobre tu día, tus trades, tus emociones, tus aprendizajes..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>

            {/* Tags */}
            <div>
              <label className="label">Etiquetas</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Añadir etiqueta..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                />
                <button type="button" onClick={addTag} className="btn-secondary">
                  Añadir
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-[#2a2a2a] text-gray-400 px-2 py-1 rounded-full flex items-center gap-1"
                    >
                      #{tag}
                      <button onClick={() => removeTag(tag)} className="text-gray-600 hover:text-gray-300">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={loading || !content} className="btn-primary flex-1">
                {loading ? 'Guardando...' : 'Guardar entrada'}
              </button>
              {todayEntry && (
                <button onClick={() => setEditing(false)} className="btn-secondary">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ) : todayEntry ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{MOOD_EMOJIS[todayEntry.mood]}</span>
              <div>
                <p className="font-medium" style={{ color: MOOD_COLORS[todayEntry.mood] }}>
                  {MOOD_LABELS[todayEntry.mood]}
                </p>
                <p className="text-xs text-gray-600">Estado de ánimo: {todayEntry.mood}/5</p>
              </div>
            </div>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{todayEntry.content}</p>
            {todayEntry.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {todayEntry.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-[#2a2a2a] text-gray-500 px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Month Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-gray-500">Entradas este mes</p>
          <p className="text-3xl font-bold text-white mt-1">{monthEntries.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Promedio de ánimo</p>
          <p className="text-3xl font-bold mt-1" style={{ color: MOOD_COLORS[Math.round(avgMood)] || '#fff' }}>
            {avgMood || '—'}
          </p>
          {avgMood > 0 && <p className="text-xs text-gray-500 mt-0.5">{MOOD_LABELS[Math.round(avgMood)]}</p>}
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500">Mes</p>
          <div className="mt-1">
            <select
              className="input text-center text-sm"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {Array.from({ length: 6 }, (_, i) => {
                const d = new Date()
                d.setMonth(d.getMonth() - i)
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
                return <option key={val} value={val}>{label}</option>
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Mood calendar grid */}
      {(() => {
        const [calYear, calMonthNum] = selectedMonth.split('-').map(Number)
        const daysInMonth = new Date(calYear, calMonthNum, 0).getDate()
        const firstDow = new Date(calYear, calMonthNum - 1, 1).getDay()
        const moodByDay: Record<number, number> = {}
        for (const entry of monthEntries) {
          const d = new Date(entry.date + 'T12:00:00')
          moodByDay[d.getDate()] = entry.mood
        }
        const todayDay = new Date().toISOString().split('T')[0].startsWith(selectedMonth) ? new Date().getDate() : -1
        return (
          <div className="card">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Calendario de ánimo — {selectedMonth}</p>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['D', 'L', 'M', 'X', 'J', 'V', 'S'].map((d) => (
                <div key={d} className="text-center text-[10px] text-gray-600 font-medium py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }, (_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1
                const mood = moodByDay[day]
                const isToday = day === todayDay
                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-lg flex items-center justify-center text-[11px] font-medium transition-colors ${
                      isToday ? 'ring-1 ring-blue-500' : ''
                    }`}
                    style={{
                      backgroundColor: mood ? `${MOOD_COLORS[mood]}22` : '#1a1a1a',
                      color: mood ? MOOD_COLORS[mood] : '#4b5563',
                      border: mood ? `1px solid ${MOOD_COLORS[mood]}44` : '1px solid #2a2a2a',
                    }}
                    title={mood ? `${MOOD_LABELS[mood]} (${mood}/5)` : undefined}
                  >
                    {day}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {[1,2,3,4,5].map((m) => (
                <div key={m} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: MOOD_COLORS[m] }} />
                  <span className="text-[10px] text-gray-600">{MOOD_LABELS[m]}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Mood chart */}
      {moodChartData.length > 1 && (
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Estado de ánimo — {selectedMonth}</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={moodChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
                itemStyle={{ color: '#e5e7eb' }}
                formatter={(value: number) => [MOOD_LABELS[value], 'Estado']}
              />
              <Line
                type="monotone"
                dataKey="mood"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#2563eb', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Month history */}
      {monthEntries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Historial del mes</h2>
          </div>

          {/* Popular tags filter */}
          {(() => {
            const allTags = Array.from(
              new Set(monthEntries.flatMap((e) => e.tags))
            ).sort()
            return allTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selectedTag && (
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="text-xs px-3 py-1 rounded-full border border-[#3a3a3a] text-gray-400 hover:text-gray-200 hover:border-[#4a4a4a] transition-colors"
                  >
                    Ver todos
                  </button>
                )}
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      selectedTag === tag
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                        : 'text-gray-500 border-[#2a2a2a] hover:text-gray-300 hover:border-[#3a3a3a]'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            ) : null
          })()}

          {[...monthEntries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .filter((e) => e.date.split('T')[0] !== today)
            .filter((e) => selectedTag === null || e.tags.includes(selectedTag))
            .map((entry) => (
              <div key={entry.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{MOOD_EMOJIS[entry.mood]}</span>
                    <p className="text-sm text-gray-400">
                      {new Date(entry.date).toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <span className="text-xs font-medium" style={{ color: MOOD_COLORS[entry.mood] }}>
                    {MOOD_LABELS[entry.mood]}
                  </span>
                </div>
                <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">{entry.content}</p>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="text-[10px] bg-[#2a2a2a] text-gray-600 px-1.5 py-0.5 rounded">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
