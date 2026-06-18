'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  startDate: string
  dueDate: string
  status: string
  isRecurring: boolean
  recurringRule: string | null
  sentAt: string | null
  employeeEmails: string[]
  company: { id: string; name: string; emoji: string; color: string }
  _count: { instances: number }
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}
const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  sent: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', sent: 'Enviado', completed: 'Completado' }

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function getMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function fmtShort(d: string | Date) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function OverlayModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export default function CorporateTasksPage() {
  const { showToast } = useToast()
  const [tasks, setTasks] = useState<CorporateTask[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  // Modals
  const [detailTask, setDetailTask] = useState<CorporateTask | null>(null)
  const [rescheduleTask, setRescheduleTask] = useState<CorporateTask | null>(null)
  const [deleteTask, setDeleteTask] = useState<CorporateTask | null>(null)
  const [newDueDate, setNewDueDate] = useState('')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthKey = getMonthKey(currentDate)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ month: monthKey })
      if (selectedCompany) p.set('companyId', selectedCompany)
      if (selectedStatus) p.set('status', selectedStatus)
      const res = await fetch(`/api/corporate-tasks?${p}`)
      if (res.ok) setTasks(await res.json())
    } catch {
      showToast('Error al cargar tareas', 'error')
    } finally {
      setLoading(false)
    }
  }, [monthKey, selectedCompany, selectedStatus])

  useEffect(() => {
    fetch('/api/companies').then((r) => r.json()).then(setCompanies).catch(() => {})
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])

  async function handleSend(id: string) {
    setSending(id)
    try {
      const res = await fetch(`/api/corporate-tasks/${id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error', 'error')
      showToast(`Enviado a ${data.sentCount} email(s)`, 'success')
      loadTasks()
      setDetailTask(null)
    } catch {
      showToast('Error al enviar', 'error')
    } finally {
      setSending(null)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/corporate-tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); return showToast(d.error ?? 'Error', 'error') }
      showToast('Tarea eliminada', 'success')
      loadTasks()
      setDeleteTask(null)
      setDetailTask(null)
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  async function handleReschedule() {
    if (!rescheduleTask || !newDueDate) return
    try {
      const res = await fetch(`/api/corporate-tasks/${rescheduleTask.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDueDate }),
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error', 'error')
      showToast('Fecha actualizada', 'success')
      loadTasks()
      setRescheduleTask(null)
      setNewDueDate('')
    } catch {
      showToast('Error al reprogramar', 'error')
    }
  }

  const calendarCells = buildCalendarCells(year, month)

  // Mostrar tarea en TODOS los días entre startDate y dueDate dentro del mes
  const tasksByDay = tasks.reduce<Record<number, CorporateTask[]>>((acc, t) => {
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    const rangeStart = new Date(t.startDate) < monthStart ? monthStart : new Date(t.startDate)
    const rangeEnd = new Date(t.dueDate) > monthEnd ? monthEnd : new Date(t.dueDate)
    const cur = new Date(rangeStart)
    cur.setHours(0, 0, 0, 0)
    const end = new Date(rangeEnd)
    end.setHours(23, 59, 59, 999)
    while (cur <= end) {
      const d = cur.getDate()
      acc[d] = [...(acc[d] ?? []), t]
      cur.setDate(cur.getDate() + 1)
    }
    return acc
  }, {})

  const displayedTasks = selectedDay ? (tasksByDay[selectedDay] ?? []) : tasks
  const monthLabel = currentDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  const today = new Date()

  function buildPdfRows(tasksToExport: CorporateTask[]) {
    return tasksToExport.map((t) => [
      t.title,
      `${t.company.emoji} ${t.company.name}`,
      new Date(t.startDate).toLocaleDateString('es-CO'),
      new Date(t.dueDate).toLocaleDateString('es-CO'),
      PRIORITY_LABEL[t.priority] ?? t.priority,
      STATUS_LABEL[t.status] ?? t.status,
      t.employeeEmails.join(', ') || '—',
    ])
  }

  function downloadPDF(mode: 'daily' | 'weekly') {
    const now = new Date()
    let filtered: CorporateTask[]
    let title: string
    let subtitle: string

    if (mode === 'daily') {
      const todayStr = now.toISOString().slice(0, 10)
      filtered = tasks.filter((t) => {
        const s = new Date(t.startDate).toISOString().slice(0, 10)
        const d = new Date(t.dueDate).toISOString().slice(0, 10)
        return s <= todayStr && todayStr <= d
      })
      title = 'Tareas Corporativas — Diario'
      subtitle = now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    } else {
      const dayOfWeek = now.getDay()
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - dayOfWeek)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      filtered = tasks.filter((t) => {
        const s = new Date(t.startDate)
        const d = new Date(t.dueDate)
        return s <= weekEnd && d >= weekStart
      })
      const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
      title = 'Tareas Corporativas — Semanal'
      subtitle = `Semana del ${fmt(weekStart)} al ${fmt(weekEnd)}`
    }

    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(16)
    doc.text(title, 14, 18)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(subtitle, 14, 25)
    doc.text(`Total: ${filtered.length} tarea(s)`, 14, 31)

    autoTable(doc, {
      startY: 36,
      head: [['Título', 'Empresa', 'Inicio', 'Vencimiento', 'Prioridad', 'Estado', 'Destinatarios']],
      body: buildPdfRows(filtered),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 45 },
        6: { cellWidth: 55 },
      },
    })

    const filename = mode === 'daily'
      ? `tareas-diario-${now.toISOString().slice(0, 10)}.pdf`
      : `tareas-semanal-${now.toISOString().slice(0, 10)}.pdf`
    doc.save(filename)
  }

  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">📋 Tareas Corporativas</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-0.5">{tasks.length} tarea(s) en este período</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setPdfMenuOpen((v) => !v)}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              PDF
            </button>
            <AnimatePresence>
              {pdfMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-full mt-1 bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-lg shadow-xl z-20 min-w-[160px] overflow-hidden"
                >
                  <button
                    onClick={() => { downloadPDF('daily'); setPdfMenuOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
                  >
                    📅 Reporte diario
                  </button>
                  <button
                    onClick={() => { downloadPDF('weekly'); setPdfMenuOpen(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-2"
                  >
                    📆 Reporte semanal
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <Link href="/corporate-tasks/new" className="btn-primary flex items-center gap-2 w-fit">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva Tarea
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select className="input w-auto" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
          <option value="">Todas las empresas</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <select className="input w-auto" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="sent">Enviado</option>
          <option value="completed">Completado</option>
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDay(null) }} className="btn-secondary px-3 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-medium text-[var(--text-primary)] min-w-[130px] text-center capitalize">{monthLabel}</span>
          <button onClick={() => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDay(null) }} className="btn-secondary px-3 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--bg-border)]">
          {DAYS.map((d) => (
            <div key={d} className="text-center text-xs text-[var(--text-muted)] font-medium py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarCells.map((day, i) => {
            const dayTasks = day ? (tasksByDay[day] ?? []) : []
            const isSelected = day === selectedDay
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
            return (
              <div
                key={i}
                onClick={() => day && setSelectedDay(isSelected ? null : day)}
                className={`min-h-[72px] p-1.5 border-b border-r border-[#111] transition-colors ${day ? 'cursor-pointer hover:bg-[var(--bg-hover)]' : 'bg-[var(--bg-base)]'} ${isSelected ? 'bg-blue-500/5 ring-inset ring-1 ring-blue-500/30' : ''}`}
              >
                {day && (
                  <>
                    <p className={`text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-blue-600 text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{day}</p>
                    <div className="space-y-0.5">
                      {dayTasks.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          onClick={(e) => { e.stopPropagation(); setDetailTask(t) }}
                          className={`text-[10px] truncate rounded px-1 py-0.5 border cursor-pointer ${PRIORITY_BADGE[t.priority] ?? 'bg-gray-500/20 text-[var(--text-secondary)] border-gray-500/30'}`}
                        >
                          {t.isRecurring && '🔄 '}{t.title}
                        </div>
                      ))}
                      {dayTasks.length > 2 && <p className="text-[10px] text-[var(--text-muted)] pl-1">+{dayTasks.length - 2}</p>}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {selectedDay && (
          <div className="px-4 py-2 border-t border-[var(--bg-border)] flex items-center justify-between">
            <p className="text-xs text-[var(--text-secondary)]">Día {selectedDay} — {tasksByDay[selectedDay]?.length ?? 0} tarea(s)</p>
            <button onClick={() => setSelectedDay(null)} className="text-xs text-blue-400 hover:text-blue-300">Ver todas</button>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="card">
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">
          {selectedDay ? `Tareas del día ${selectedDay}` : 'Tareas del mes'}
        </h2>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-[var(--bg-elevated)] animate-pulse rounded-lg" />)}</div>
        ) : displayedTasks.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-[var(--text-muted)]">Sin tareas en este período</p>
            <Link href="/corporate-tasks/new" className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block">+ Crear primera tarea</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-[var(--bg-border)]">
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium pr-4">Título</th>
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium pr-4 hidden md:table-cell">Empresa</th>
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium pr-4 hidden sm:table-cell">Inicio</th>
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium pr-4 hidden sm:table-cell">Vencimiento</th>
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium pr-4">Prioridad</th>
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium pr-4">Estado</th>
                  <th className="pb-2 text-xs text-[var(--text-muted)] font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bg-border)]">
                {displayedTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-[var(--bg-card)] transition-colors">
                    <td className="py-3 pr-4">
                      <p className="text-[var(--text-primary)] font-medium truncate max-w-[180px]">
                        {task.isRecurring && <span className="text-purple-400 mr-1">🔄</span>}
                        {task.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{task.employeeEmails.length} destinatario(s)</p>
                    </td>
                    <td className="py-3 pr-4 hidden md:table-cell text-xs text-[var(--text-secondary)]">{task.company.emoji} {task.company.name}</td>
                    <td className="py-3 pr-4 hidden sm:table-cell text-xs text-[var(--text-secondary)]">
                      {fmtShort(task.startDate)}
                    </td>
                    <td className="py-3 pr-4 hidden sm:table-cell text-xs text-[var(--text-secondary)]">
                      {fmtShort(task.dueDate)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[task.priority] ?? ''}`}>
                        {PRIORITY_LABEL[task.priority] ?? task.priority}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_BADGE[task.status] ?? ''}`}>
                        {STATUS_LABEL[task.status] ?? task.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetailTask(task)} className="p-1.5 rounded text-[var(--text-secondary)] hover:text-blue-400 hover:bg-blue-500/10 transition-colors" title="Ver">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        {task.status === 'pending' && (
                          <>
                            <button onClick={() => handleSend(task.id)} disabled={sending === task.id} className="p-1.5 rounded text-[var(--text-secondary)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-50" title="Enviar">
                              {sending === task.id
                                ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                              }
                            </button>
                            <Link href={`/corporate-tasks/${task.id}`} className="p-1.5 rounded text-[var(--text-secondary)] hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors" title="Editar">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </Link>
                            <button onClick={() => { setRescheduleTask(task); setNewDueDate('') }} className="p-1.5 rounded text-[var(--text-secondary)] hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors" title="Mover fecha">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            </button>
                          </>
                        )}
                        <button onClick={() => setDeleteTask(task)} className="p-1.5 rounded text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Eliminar">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Detail */}
      <AnimatePresence>
        {detailTask && (
          <OverlayModal onClose={() => setDetailTask(null)}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {detailTask.isRecurring && <span className="text-purple-400 text-sm">🔄</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${PRIORITY_BADGE[detailTask.priority] ?? ''}`}>
                      {PRIORITY_LABEL[detailTask.priority]}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_BADGE[detailTask.status] ?? ''}`}>
                      {STATUS_LABEL[detailTask.status]}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{detailTask.title}</h2>
                </div>
                <button onClick={() => setDetailTask(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-3 flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <p className="text-[var(--text-secondary)] text-sm mb-4 leading-relaxed">{detailTask.description}</p>
              <div className="space-y-2 mb-4">
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="text-[var(--text-secondary)]">Empresa:</span> {detailTask.company.emoji} {detailTask.company.name}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="text-[var(--text-secondary)]">Inicio:</span> {fmtShort(detailTask.startDate)} &nbsp;→&nbsp; <span className="text-[var(--text-secondary)]">Vence:</span> {fmtShort(detailTask.dueDate)}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="text-[var(--text-secondary)]">Destinatarios:</span> {detailTask.employeeEmails.join(', ') || '—'}
                </p>
                {detailTask.sentAt && (
                  <p className="text-xs text-purple-400">
                    ✓ Enviado el {new Date(detailTask.sentAt).toLocaleDateString('es-CO')}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {detailTask.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleSend(detailTask.id)}
                      disabled={sending === detailTask.id}
                      className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                      Enviar ahora
                    </button>
                    <Link href={`/corporate-tasks/${detailTask.id}`} className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      Editar
                    </Link>
                    <button
                      onClick={() => { setRescheduleTask(detailTask); setDetailTask(null); setNewDueDate('') }}
                      className="btn-secondary text-sm py-2 px-3 flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      Mover
                    </button>
                  </>
                )}
                <button
                  onClick={() => { setDeleteTask(detailTask); setDetailTask(null) }}
                  className="btn-secondary text-red-400 hover:border-red-500/30 text-sm py-2 px-3"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </OverlayModal>
        )}
      </AnimatePresence>

      {/* MODAL: Reschedule */}
      <AnimatePresence>
        {rescheduleTask && (
          <OverlayModal onClose={() => setRescheduleTask(null)}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">📅 Mover fecha</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-4">{rescheduleTask.title}</p>
              <div className="mb-4">
                <label className="label">Nueva fecha límite</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={handleReschedule} disabled={!newDueDate} className="btn-primary flex-1 disabled:opacity-50">Confirmar</button>
                <button onClick={() => setRescheduleTask(null)} className="btn-secondary">Cancelar</button>
              </div>
            </div>
          </OverlayModal>
        )}
      </AnimatePresence>

      {/* MODAL: Delete confirm */}
      <AnimatePresence>
        {deleteTask && (
          <OverlayModal onClose={() => setDeleteTask(null)}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">🗑️ Eliminar tarea</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-1">¿Eliminar <strong className="text-[var(--text-primary)]">"{deleteTask.title}"</strong>?</p>
              <p className="text-[var(--text-muted)] text-xs mb-6">Esta acción no se puede deshacer.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDelete(deleteTask.id)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                >
                  Sí, eliminar
                </button>
                <button onClick={() => setDeleteTask(null)} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </div>
          </OverlayModal>
        )}
      </AnimatePresence>
    </div>
  )
}
