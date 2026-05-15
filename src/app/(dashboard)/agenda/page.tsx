'use client'

import { useEffect, useState } from 'react'
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

function getWeekDates(): { date: Date; str: string }[] {
  const today = new Date()
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d, str: d.toISOString().split('T')[0] }
  })
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

export default function AgendaPage() {
  const { showToast } = useToast()
  const [events, setEvents] = useState<Event[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [view, setView] = useState<'semana' | 'lista'>('semana')

  const weekDates = getWeekDates()
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    setPageLoading(true)
    setLoadError(false)
    try {
      const from = weekDates[0].str
      const future = new Date()
      future.setDate(future.getDate() + 30)
      const to = future.toISOString().split('T')[0]
      const res = await fetch(`/api/events?from=${from}&to=${to}`)
      if (!res.ok) throw new Error()
      setEvents(await res.json())
    } catch {
      setLoadError(true)
    }
    setPageLoading(false)
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
      const payload = { ...form }
      const res = editEvent
        ? await fetch(`/api/events/${editEvent.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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

  function requestDelete(id: string) {
    setConfirmDelete(id)
  }

  const getEventsForDay = (dateStr: string) =>
    events.filter((e) => e.date.startsWith(dateStr))

  const upcomingEvents = events
    .filter((e) => e.date.split('T')[0] >= today)
    .slice(0, 20)

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-gray-500">Error al cargar los eventos</p>
        <button onClick={loadEvents} className="btn-primary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-gray-500 text-sm mt-0.5">Planifica tu semana de trading y vida</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-0.5">
            <button
              onClick={() => setView('semana')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                view === 'semana' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setView('lista')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                view === 'lista' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Lista
            </button>
          </div>
          <button onClick={() => openCreate()} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuevo evento
          </button>
        </div>
      </div>

      {pageLoading ? (
        <div className="card animate-pulse h-64" />
      ) : view === 'semana' ? (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-[#2a2a2a]">
            {weekDates.map(({ date, str }) => {
              const dayEvents = getEventsForDay(str)
              const isToday = str === today
              return (
                <div key={str} className="min-h-32">
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
                        onClick={() => openEdit(event)}
                        className={`cursor-pointer rounded px-1.5 py-1 text-[10px] leading-tight border ${
                          event.isForexNews
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : TYPE_COLORS[event.type]
                        } hover:opacity-80 transition-opacity`}
                      >
                        <p className="font-medium truncate">{event.title}</p>
                        {event.time && <p className="text-current/60">{event.time}</p>}
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
      ) : (
        <div className="space-y-2">
          {upcomingEvents.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-600 text-sm">No hay eventos próximos</p>
            </div>
          ) : (
            upcomingEvents.map((event) => (
              <div key={event.id} className="card flex items-start gap-4">
                <div className="text-xl flex-shrink-0 mt-0.5">
                  {event.isForexNews ? '⚠️' : TYPE_ICONS[event.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-white text-sm">{event.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[event.type]}`}>
                      {event.type}
                    </span>
                    {event.isForexNews && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                        Forex News {event.forexPair}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(event.date).toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {event.time && ` · ${event.time}`}
                  </p>
                  {event.notes && <p className="text-xs text-gray-600 mt-1">{event.notes}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(event)} className="text-gray-600 hover:text-gray-400 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => requestDelete(event.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {EVENT_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
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
                onClick={() => requestDelete(editEvent.id)}
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
