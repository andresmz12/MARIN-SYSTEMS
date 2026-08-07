'use client'

import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

interface Event {
  id: string
  title: string
  date: string
  time: string | null
  type: string
  notes: string | null
  isForexNews: boolean
  forexPair: string | null
  completed: boolean
}

const EVENT_TYPES = ['personal', 'trading', 'aprendizaje', 'otro']
const TYPE_COLORS: Record<string, string> = {
  personal: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  trading: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  aprendizaje: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  otro: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}
const TYPE_ICONS: Record<string, string> = {
  personal: '👤',
  trading: '📊',
  aprendizaje: '📚',
  otro: '📌',
}

function getWeekDates(offset = 0): { date: Date; str: string }[] {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d, str: d.toISOString().split('T')[0] }
  })
}

function getMonthDates(offset = 0): { date: Date; str: string; inMonth: boolean }[] {
  const now = new Date()
  const targetMonth = now.getMonth() + offset
  const first = new Date(now.getFullYear(), targetMonth, 1)
  const last = new Date(now.getFullYear(), targetMonth + 1, 0)

  const startDay = first.getDay()
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - (startDay === 0 ? 6 : startDay - 1))

  const endDay = last.getDay()
  const gridEnd = new Date(last)
  gridEnd.setDate(last.getDate() + (endDay === 0 ? 0 : 7 - endDay))

  const days: { date: Date; str: string; inMonth: boolean }[] = []
  for (const cur = new Date(gridStart); cur <= gridEnd; cur.setDate(cur.getDate() + 1)) {
    days.push({
      date: new Date(cur),
      str: cur.toISOString().split('T')[0],
      inMonth: cur.getMonth() === first.getMonth() && cur.getFullYear() === first.getFullYear(),
    })
  }
  return days
}

const emptyForm = {
  title: '',
  date: new Date().toISOString().split('T')[0],
  time: '',
  type: 'personal',
  notes: '',
  isForexNews: false,
  forexPair: '',
}

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAYS_ES_MON_FIRST = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function AgendaPage() {
  const { showToast } = useToast()
  const [events, setEvents] = useState<Event[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'semana' | 'mes' | 'lista'>('lista')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [calendarToken, setCalendarToken] = useState<string | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarCopied, setCalendarCopied] = useState(false)
  const [showCalendarSection, setShowCalendarSection] = useState(false)

  const weekDates = getWeekDates(weekOffset)
  const monthDates = getMonthDates(monthOffset)
  const monthLabelRaw = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1)
    .toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1)
  const today = new Date().toISOString().split('T')[0]

  const loadEvents = useCallback(async () => {
    // Ventana amplia (6 meses atrás / adelante) para que Semana, Mes y Lista
    // puedan navegar sin tener que re-consultar la API en cada cambio de vista.
    const past = new Date()
    past.setDate(past.getDate() - 180)
    const from = past.toISOString().split('T')[0]
    const future = new Date()
    future.setDate(future.getDate() + 180)
    const to = future.toISOString().split('T')[0]
    const res = await fetch(`/api/events?from=${from}&to=${to}`, { cache: 'no-store' })
    if (res.ok) setEvents(await res.json())
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  async function getCalendarToken() {
    setCalendarLoading(true)
    const res = await fetch('/api/calendar/token')
    if (res.ok) {
      const data = await res.json()
      setCalendarToken(data.token)
    }
    setCalendarLoading(false)
  }

  async function regenerateToken() {
    setCalendarLoading(true)
    const res = await fetch('/api/calendar/token', { method: 'DELETE' })
    if (res.ok) {
      const data = await res.json()
      setCalendarToken(data.token)
    }
    setCalendarLoading(false)
  }

  function getCalendarUrl(token: string) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/api/calendar?token=${token}`
  }

  async function copyCalendarUrl() {
    if (!calendarToken) return
    await navigator.clipboard.writeText(getCalendarUrl(calendarToken))
    setCalendarCopied(true)
    setTimeout(() => setCalendarCopied(false), 2000)
  }

  function openCreate(dateStr?: string) {
    setEditEvent(null)
    setForm({ ...emptyForm, date: dateStr || today })
    setModalOpen(true)
  }

  function openEdit(event: Event) {
    setEditEvent(event)
    setForm({
      title: event.title,
      date: event.date.split('T')[0],
      time: event.time || '',
      type: event.type,
      notes: event.notes || '',
      isForexNews: event.isForexNews,
      forexPair: event.forexPair || '',
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = editEvent
        ? await fetch(`/api/events/${editEvent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
        : await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
      if (!res.ok) throw new Error()
      showToast(editEvent ? 'Evento actualizado' : 'Evento creado', 'success')
      setModalOpen(false)
      loadEvents()
    } catch {
      showToast('Error al guardar el evento', 'error')
    }
    setLoading(false)
  }

  async function confirmDeleteEvent() {
    if (!confirmDelete) return
    try {
      await fetch(`/api/events/${confirmDelete}`, { method: 'DELETE' })
      showToast('Evento eliminado', 'success')
      setModalOpen(false)
      loadEvents()
    } catch {
      showToast('Error al eliminar', 'error')
    }
    setConfirmDelete(null)
  }

  async function toggleComplete(event: Event) {
    await fetch(`/api/events/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !event.completed }),
    })
    loadEvents()
  }

  const getEventsForDay = (dateStr: string) =>
    events.filter((e) => e.date.startsWith(dateStr))

  const upcomingEvents = events
    .filter((e) => {
      const dateStr = e.date.split('T')[0]
      return dateStr >= today || !e.completed
    })
    .filter((e) => !hideCompleted || !e.completed)
    .slice(0, 50)

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">Agenda</h1>
          <p className="text-gray-500 text-xs lg:text-sm mt-0.5">Planifica tu semana</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
            <button
              onClick={() => setView('semana')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                view === 'semana' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setView('mes')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                view === 'mes' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Mes
            </button>
            <button
              onClick={() => setView('lista')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                view === 'lista' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Lista
            </button>
          </div>
          <button
            onClick={() => setHideCompleted(h => !h)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
              hideCompleted
                ? 'bg-blue-600/20 text-blue-400 border-blue-600/30'
                : 'text-gray-500 border-[#2a2a2a] hover:text-gray-300 hover:border-[#3a3a3a]'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden sm:inline">{hideCompleted ? 'Mostrando pendientes' : 'Ocultar hechos'}</span>
          </button>
          <button
            onClick={() => openCreate()}
            className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Nuevo evento</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* Google Calendar sync section */}
      <div className="card p-3 lg:p-4">
        <button
          onClick={() => {
            setShowCalendarSection(!showCalendarSection)
            if (!showCalendarSection && !calendarToken) getCalendarToken()
          }}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1557e0]/20 border border-[#1557e0]/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-[#4285f4]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Google Calendar</p>
              <p className="text-[11px] text-gray-500">Recibe recordatorios en tu celular</p>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${showCalendarSection ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showCalendarSection && (
          <div className="mt-4 space-y-3 border-t border-[#2a2a2a] pt-4">
            {calendarLoading ? (
              <p className="text-sm text-gray-500 text-center py-2">Cargando...</p>
            ) : calendarToken ? (
              <>
                <p className="text-xs text-gray-400">
                  Copia esta URL y agrégala a Google Calendar como &quot;Otras agendas → Desde URL&quot;.
                  Tus eventos aparecerán automáticamente con recordatorios 30 min antes.
                </p>
                <div className="flex gap-2">
                  <div className="flex-1 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-3 py-2 text-[11px] text-gray-400 overflow-hidden">
                    <p className="truncate">{getCalendarUrl(calendarToken)}</p>
                  </div>
                  <button
                    onClick={copyCalendarUrl}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      calendarCopied
                        ? 'bg-green-600/20 text-green-400 border-green-600/30'
                        : 'bg-[#1a1a1a] text-gray-300 border-[#2a2a2a] hover:border-blue-600/40 hover:text-blue-400'
                    }`}
                  >
                    {calendarCopied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <ol className="space-y-1.5 text-xs text-gray-500">
                  <li className="flex gap-2"><span className="text-blue-400 font-bold flex-shrink-0">1.</span>Abre Google Calendar en tu celular</li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold flex-shrink-0">2.</span>Ve a Ajustes → Agregar calendario → Desde URL</li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold flex-shrink-0">3.</span>Pega la URL copiada y presiona &quot;Agregar calendario&quot;</li>
                  <li className="flex gap-2"><span className="text-blue-400 font-bold flex-shrink-0">4.</span>Los eventos con hora incluyen recordatorio automático de 30 min</li>
                </ol>
                <button onClick={regenerateToken} className="text-[11px] text-gray-600 hover:text-red-400 transition-colors">
                  Regenerar URL (invalida la anterior)
                </button>
              </>
            ) : (
              <button onClick={getCalendarToken} className="btn-primary text-sm w-full">
                Generar enlace de calendario
              </button>
            )}
          </div>
        )}
      </div>

      {/* Week view */}
      {view === 'semana' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <p className="text-xs text-gray-400">
              {weekDates[0].date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
              {' – '}
              {weekDates[6].date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 divide-x divide-[#2a2a2a] min-w-[560px]">
                {weekDates.map(({ date, str }) => {
                  const dayEvents = getEventsForDay(str)
                  const isToday = str === today
                  return (
                    <div key={str} className="min-h-28">
                      <div className={`p-2 border-b border-[#2a2a2a] text-center ${isToday ? 'bg-blue-600/10' : ''}`}>
                        <p className="text-[10px] text-gray-500">{DAYS_ES[date.getDay()]}</p>
                        <p className={`text-sm font-bold mt-0.5 ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>
                          {date.getDate()}
                        </p>
                      </div>
                      <div className="p-1 space-y-1">
                        {dayEvents.map((event) => (
                          <div
                            key={event.id}
                            className={`rounded px-1.5 py-1 text-[10px] leading-tight border flex items-start gap-1 ${
                              event.completed
                                ? 'bg-[#1a1a1a] border-[#2a2a2a] opacity-50'
                                : event.isForexNews
                                ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                : TYPE_COLORS[event.type]
                            }`}
                          >
                            <button
                              onClick={() => toggleComplete(event)}
                              className={`mt-0.5 w-2.5 h-2.5 rounded-full border flex-shrink-0 flex items-center justify-center transition-colors ${
                                event.completed ? 'bg-green-500 border-green-500' : 'border-current opacity-50 hover:opacity-100'
                              }`}
                            />
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(event)}>
                              <p className={`font-medium truncate ${event.completed ? 'line-through text-gray-500' : ''}`}>{event.title}</p>
                              {event.time && <p className="text-current/60">{event.time}</p>}
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => openCreate(str)}
                          className="w-full text-[10px] text-gray-700 hover:text-gray-500 py-0.5 text-center transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : view === 'mes' ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setMonthOffset(m => m - 1)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400">{monthLabel}</p>
              {monthOffset !== 0 && (
                <button onClick={() => setMonthOffset(0)} className="text-[10px] text-blue-400 hover:text-blue-300">
                  Hoy
                </button>
              )}
            </div>
            <button
              onClick={() => setMonthOffset(m => m + 1)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-7 divide-x divide-[#2a2a2a] border-b border-[#2a2a2a]">
                  {DAYS_ES_MON_FIRST.map((d) => (
                    <p key={d} className="p-2 text-center text-[10px] text-gray-500">{d}</p>
                  ))}
                </div>
                <div className="grid grid-cols-7 divide-x divide-y divide-[#2a2a2a]">
                  {monthDates.map(({ date, str, inMonth }) => {
                    const dayEvents = getEventsForDay(str)
                    const isToday = str === today
                    const visible = dayEvents.slice(0, 3)
                    const overflow = dayEvents.length - visible.length
                    return (
                      <div
                        key={str}
                        className={`min-h-24 p-1 ${!inMonth ? 'opacity-40' : ''} ${isToday ? 'bg-blue-600/10' : ''}`}
                      >
                        <p className={`text-[11px] px-1 pt-0.5 font-semibold ${isToday ? 'text-blue-400' : 'text-gray-400'}`}>
                          {date.getDate()}
                        </p>
                        <div className="space-y-0.5 mt-0.5">
                          {visible.map((event) => (
                            <div
                              key={event.id}
                              onClick={() => openEdit(event)}
                              className={`rounded px-1 py-0.5 text-[9px] leading-tight border truncate cursor-pointer ${
                                event.completed
                                  ? 'bg-[#1a1a1a] border-[#2a2a2a] opacity-50 line-through'
                                  : event.isForexNews
                                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                  : TYPE_COLORS[event.type]
                              }`}
                            >
                              {event.title}
                            </div>
                          ))}
                          {overflow > 0 && (
                            <p className="text-[9px] text-gray-600 px-1">+{overflow} más</p>
                          )}
                          <button
                            onClick={() => openCreate(str)}
                            className="w-full text-[10px] text-gray-700 hover:text-gray-500 text-center transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* List view */
        <div className="space-y-2">
          {upcomingEvents.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-600 text-sm">No hay eventos próximos</p>
            </div>
          ) : (
            upcomingEvents.map((event) => (
              <div key={event.id} className={`card flex items-start gap-3 p-3 lg:p-4 transition-opacity ${event.completed ? 'opacity-60' : ''}`}>
                <button
                  onClick={() => toggleComplete(event)}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    event.completed
                      ? 'bg-green-500 border-green-500'
                      : 'border-gray-600 hover:border-green-500'
                  }`}
                >
                  {event.completed && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium text-sm ${event.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                      {event.title}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[event.type]}`}>
                      {event.type}
                    </span>
                    {event.isForexNews && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                        Forex {event.forexPair}
                      </span>
                    )}
                    {event.completed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
                        Hecho
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(event.date).toLocaleDateString('es-CO', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                    {event.time && ` · ${event.time}`}
                  </p>
                  {event.notes && <p className="text-xs text-gray-600 mt-1">{event.notes}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(event)} className="text-gray-600 hover:text-gray-400 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => setConfirmDelete(event.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editEvent ? 'Editar evento' : 'Nuevo evento'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Título</label>
            <input
              type="text"
              className="input"
              placeholder="Título del evento"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Hora (opcional)</label>
              <input
                type="time"
                className="input"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isForexNews}
              onChange={(e) => setForm({ ...form, isForexNews: e.target.checked })}
              className="w-4 h-4 rounded accent-red-500"
            />
            <span className="text-sm text-gray-300">Noticia Forex de alto impacto</span>
          </label>
          {form.isForexNews && (
            <div>
              <label className="label">Par afectado</label>
              <input
                type="text"
                className="input"
                placeholder="EUR/USD, USD/JPY..."
                value={form.forexPair}
                onChange={(e) => setForm({ ...form, forexPair: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="label">Notas (opcional)</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Guardando...' : editEvent ? 'Actualizar' : 'Crear evento'}
            </button>
            {editEvent && (
              <button
                type="button"
                onClick={() => setConfirmDelete(editEvent.id)}
                className="btn-danger"
              >
                Eliminar
              </button>
            )}
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title="Eliminar evento"
        message="¿Seguro que quieres eliminar este evento? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDeleteEvent}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
