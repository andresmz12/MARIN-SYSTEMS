'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'

interface Company {
  id: string
  name: string
  emoji: string
  color: string
}

interface CorporateTask {
  id: string
  title: string
  description: string
  priority: string
  dueDate: string
  status: string
  isRecurring: boolean
  recurringRule: string | null
  sentAt: string | null
  employeeEmails: string[]
  company: { id: string; name: string; emoji: string; color: string }
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const PRIORITY_LABELS: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  sent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const STATUS_LABELS: Record<string, string> = { pending: 'Pendiente', sent: 'Enviado', completed: 'Completado' }

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function CorporateTasksPage() {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<CorporateTask[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthKey = getMonthKey(currentDate)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ month: monthKey })
      if (selectedCompany) params.set('companyId', selectedCompany)
      const res = await fetch(`/api/corporate-tasks?${params}`)
      if (res.ok) setTasks(await res.json())
    } catch {
      showToast('Error al cargar tareas', 'error')
    } finally {
      setLoading(false)
    }
  }, [monthKey, selectedCompany])

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => {})
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }
  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  async function handleSend(id: string) {
    setSending(id)
    try {
      const res = await fetch(`/api/corporate-tasks/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error al enviar', 'error')
      showToast(`Enviado a ${data.sentCount} email(s)`, 'success')
      loadTasks()
    } catch {
      showToast('Error al enviar', 'error')
    } finally {
      setSending(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta tarea?')) return
    try {
      const res = await fetch(`/api/corporate-tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        return showToast(data.error ?? 'Error al eliminar', 'error')
      }
      showToast('Tarea eliminada', 'success')
      loadTasks()
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  const calendarDays = buildCalendarDays(year, month)

  const tasksByDay = tasks.reduce<Record<number, CorporateTask[]>>((acc, task) => {
    const d = new Date(task.dueDate).getDate()
    acc[d] = [...(acc[d] ?? []), task]
    return acc
  }, {})

  const displayedTasks = selectedDay ? (tasksByDay[selectedDay] ?? []) : tasks

  const monthLabel = currentDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📋 Tareas Corporativas</h1>
          <p className="text-gray-500 text-sm mt-0.5">{tasks.length} tarea(s) este mes</p>
        </div>
        <Link href="/corporate-tasks/new" className="btn-primary flex items-center gap-2 w-fit">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Tarea
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          className="input w-auto"
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
        >
          <option value="">Todas las empresas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 ml-auto">
          <button onClick={prevMonth} className="btn-secondary px-3 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-200 min-w-[130px] text-center capitalize">{monthLabel}</span>
          <button onClick={nextMonth} className="btn-secondary px-3 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="card">
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs text-gray-600 font-medium py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-[#1a1a1a]">
          {calendarDays.map((day, i) => {
            const dayTasks = day ? (tasksByDay[day] ?? []) : []
            const isSelected = day === selectedDay
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()
            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(isSelected ? null : day)}
                className={`min-h-[70px] p-1.5 bg-[#0d0d0d] transition-colors ${
                  day ? 'cursor-pointer hover:bg-[#161616]' : ''
                } ${isSelected ? 'ring-1 ring-blue-500/50 bg-blue-500/5' : ''}`}
              >
                {day && (
                  <>
                    <p className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-600 text-white' : 'text-gray-500'
                    }`}>{day}</p>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <div
                          key={t.id}
                          className={`text-[10px] truncate rounded px-1 py-0.5 border ${PRIORITY_COLORS[t.priority] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}
                        >
                          {t.isRecurring && '🔄 '}{t.title}
                        </div>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-[10px] text-gray-600">+{dayTasks.length - 3} más</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {selectedDay && (
          <div className="mt-3 pt-3 border-t border-[#1a1a1a] flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Mostrando tareas del día {selectedDay}
            </p>
            <button onClick={() => setSelectedDay(null)} className="text-xs text-blue-400 hover:text-blue-300">
              Ver todas
            </button>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          {selectedDay ? `Tareas del día ${selectedDay}` : 'Tareas del mes'}
        </h2>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-[#1a1a1a] animate-pulse rounded-lg" />)}
          </div>
        ) : displayedTasks.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-600">Sin tareas en este período</p>
            <Link href="/corporate-tasks/new" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">
              + Crear primera tarea
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[#1a1a1a]">
                  <th className="pb-2 text-xs text-gray-600 font-medium">Título</th>
                  <th className="pb-2 text-xs text-gray-600 font-medium hidden md:table-cell">Empresa</th>
                  <th className="pb-2 text-xs text-gray-600 font-medium hidden sm:table-cell">Fecha</th>
                  <th className="pb-2 text-xs text-gray-600 font-medium">Prioridad</th>
                  <th className="pb-2 text-xs text-gray-600 font-medium">Estado</th>
                  <th className="pb-2 text-xs text-gray-600 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111]">
                {displayedTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-[#111] transition-colors">
                    <td className="py-3 pr-4">
                      <p className="text-gray-200 font-medium truncate max-w-[180px]">
                        {task.isRecurring && <span className="mr-1 text-purple-400">🔄</span>}
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-600">{task.employeeEmails.length} destinatario(s)</p>
                    </td>
                    <td className="py-3 pr-4 hidden md:table-cell">
                      <span className="text-gray-400 text-xs">
                        {task.company.emoji} {task.company.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 hidden sm:table-cell text-xs text-gray-500">
                      {new Date(task.dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[task.status] ?? ''}`}>
                        {STATUS_LABELS[task.status] ?? task.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/corporate-tasks/${task.id}`}
                          className="p-1.5 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Ver detalle"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Link>
                        {task.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleSend(task.id)}
                              disabled={sending === task.id}
                              className="p-1.5 rounded text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-50"
                              title="Enviar ahora"
                            >
                              {sending === task.id ? (
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                            <Link
                              href={`/corporate-tasks/${task.id}`}
                              className="p-1.5 rounded text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                              title="Editar"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </Link>
                            <button
                              onClick={() => handleDelete(task.id)}
                              className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Eliminar"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
