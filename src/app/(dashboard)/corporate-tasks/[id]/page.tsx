'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'

interface TaskInstance {
  id: string
  scheduledDate: string
  status: string
  sentAt: string | null
  morningReminderSentAt: string | null
  eveningReminderSentAt: string | null
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
  recurringEndDate: string | null
  sentAt: string | null
  completedAt: string | null
  employeeEmails: string[]
  attachmentUrl: string | null
  internalNotes: string | null
  company: { id: string; name: string; emoji: string; color: string }
  instances: TaskInstance[]
}

interface Company { id: string; name: string; emoji: string }

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const PRIORITY_LABEL: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }
const RULE_LABEL: Record<string, string> = { daily: 'Diario', weekly: 'Semanal', biweekly: 'Cada 2 semanas', monthly: 'Mensual' }

const PRIORITY_OPTIONS = [
  { value: 'low', label: '🟢 Baja' },
  { value: 'medium', label: '🟡 Media' },
  { value: 'high', label: '🟠 Alta' },
  { value: 'urgent', label: '🔴 Urgente' },
]
const RECURRING_RULES = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Cada 2 semanas' },
  { value: 'monthly', label: 'Mensual' },
]

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysBetween(a: string | Date, b: string | Date) {
  const diff = new Date(b).getTime() - new Date(a).getTime()
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1)
}

function OverlayModal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="bg-[#111] border border-[#2a2a2a] rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export default function CorporateTaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const [task, setTask] = useState<CorporateTask | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [newDueDate, setNewDueDate] = useState('')

  const [editForm, setEditForm] = useState({
    title: '', description: '', priority: 'medium',
    startDate: '', dueDate: '',
    employeeEmails: '', attachmentUrl: '', internalNotes: '',
    isRecurring: false, recurringRule: 'weekly', recurringEndDate: '',
  })

  useEffect(() => {
    Promise.all([
      fetch(`/api/corporate-tasks/${params.id}`).then((r) => r.json()),
      fetch('/api/companies').then((r) => r.json()),
    ]).then(([taskData, companiesData]) => {
      if (taskData.error) { showToast(taskData.error, 'error'); return }
      setTask(taskData)
      setCompanies(companiesData)
      setEditForm({
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        startDate: new Date(taskData.startDate).toISOString().slice(0, 16),
        dueDate: new Date(taskData.dueDate).toISOString().slice(0, 16),
        employeeEmails: taskData.employeeEmails.join('\n'),
        attachmentUrl: taskData.attachmentUrl ?? '',
        internalNotes: taskData.internalNotes ?? '',
        isRecurring: taskData.isRecurring,
        recurringRule: taskData.recurringRule ?? 'weekly',
        recurringEndDate: taskData.recurringEndDate ? taskData.recurringEndDate.slice(0, 10) : '',
      })
    }).catch(() => showToast('Error al cargar tarea', 'error'))
      .finally(() => setLoading(false))
  }, [params.id])

  async function handleSend() {
    if (!task) return
    setSending(true)
    try {
      const res = await fetch(`/api/corporate-tasks/${task.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error al enviar', 'error')
      showToast(`✅ Enviado a ${data.sentCount} email(s)`, 'success')
      setTask((p) => p ? { ...p, status: 'sent', sentAt: new Date().toISOString() } : p)
    } catch {
      showToast('Error al enviar', 'error')
    } finally {
      setSending(false)
    }
  }

  async function handleEdit() {
    if (!task) return
    if (new Date(editForm.startDate) > new Date(editForm.dueDate)) {
      return showToast('La fecha de inicio debe ser anterior o igual a la fecha límite', 'error')
    }
    const emails = editForm.employeeEmails.split('\n').map((e) => e.trim()).filter(Boolean)
    try {
      const res = await fetch(`/api/corporate-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          employeeEmails: emails,
          attachmentUrl: editForm.attachmentUrl || undefined,
          internalNotes: editForm.internalNotes || undefined,
          recurringRule: editForm.isRecurring ? editForm.recurringRule : undefined,
          recurringEndDate: editForm.isRecurring && editForm.recurringEndDate ? editForm.recurringEndDate : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error al guardar', 'error')
      showToast('Cambios guardados', 'success')
      setShowEdit(false)
      const t = await fetch(`/api/corporate-tasks/${task.id}`).then((r) => r.json())
      setTask(t)
    } catch {
      showToast('Error al guardar', 'error')
    }
  }

  async function handleReschedule() {
    if (!task || !newDueDate) return
    try {
      const res = await fetch(`/api/corporate-tasks/${task.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDueDate }),
      })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error', 'error')
      showToast('Fecha actualizada', 'success')
      setShowReschedule(false)
      setTask((p) => p ? { ...p, dueDate: newDueDate } : p)
    } catch {
      showToast('Error al reprogramar', 'error')
    }
  }

  async function handleDelete() {
    if (!task) return
    try {
      const res = await fetch(`/api/corporate-tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); return showToast(d.error ?? 'Error', 'error') }
      showToast('Tarea eliminada', 'success')
      router.push('/corporate-tasks')
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 w-64 bg-[#1a1a1a] animate-pulse rounded" />
        <div className="card h-48 bg-[#1a1a1a] animate-pulse" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Tarea no encontrada</p>
        <Link href="/corporate-tasks" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">← Volver</Link>
      </div>
    )
  }

  const duration = daysBetween(task.startDate, task.dueDate)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/corporate-tasks" className="text-gray-500 hover:text-gray-300 transition-colors mt-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7"/></svg>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {task.isRecurring && <span className="text-purple-400">🔄</span>}
            <span className={`text-xs px-2 py-0.5 rounded border ${PRIORITY_BADGE[task.priority] ?? ''}`}>{PRIORITY_LABEL[task.priority] ?? task.priority}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${task.status === 'pending' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : task.status === 'sent' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
              {task.status === 'pending' ? 'Pendiente' : task.status === 'sent' ? 'Enviado' : 'Completado'}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white">{task.title}</h1>
        </div>
      </div>

      {/* Main card */}
      <div className="card space-y-5">
        <div>
          <p className="label mb-1">Descripción</p>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{task.description || '—'}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="label mb-1">Empresa</p>
            <p className="text-gray-200 text-sm">{task.company.emoji} {task.company.name}</p>
          </div>
          <div>
            <p className="label mb-1">Duración</p>
            <p className="text-gray-200 text-sm">{duration} día{duration !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Fechas destacadas */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Desde</p>
            <p className="text-sm text-gray-200 font-medium">{fmtDate(task.startDate)}</p>
          </div>
          <div className="bg-[#0d0d0d] border border-[#1a1a1a] rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Hasta</p>
            <p className="text-sm text-gray-200 font-medium">{fmtDate(task.dueDate)}</p>
          </div>
        </div>

        <div>
          <p className="label mb-1">Destinatarios ({task.employeeEmails.length})</p>
          {task.employeeEmails.length === 0 ? (
            <p className="text-gray-600 text-sm">Sin destinatarios</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {task.employeeEmails.map((email) => (
                <span key={email} className="text-xs px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400 font-mono">{email}</span>
              ))}
            </div>
          )}
        </div>

        {task.attachmentUrl && (
          <div>
            <p className="label mb-1">Adjunto</p>
            <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              Ver adjunto
            </a>
          </div>
        )}

        {task.status === 'pending' && task.internalNotes && (
          <div>
            <p className="label mb-1">Notas internas</p>
            <p className="text-gray-400 text-sm whitespace-pre-wrap bg-[#0d0d0d] rounded-lg p-3 border border-[#1a1a1a]">{task.internalNotes}</p>
          </div>
        )}

        {task.sentAt && (
          <div className="flex items-center gap-2 text-sm text-purple-400">
            <span className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
            Enviado el {new Date(task.sentAt).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
          </div>
        )}

        {task.isRecurring && task.recurringRule && (
          <div className="flex items-center gap-2 text-sm text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
            <span>🔄</span>
            <span>
              Recurrente: <strong>{RULE_LABEL[task.recurringRule] ?? task.recurringRule}</strong>
              {task.recurringEndDate && <> hasta <strong>{new Date(task.recurringEndDate).toLocaleDateString('es-CO')}</strong></>}
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {task.status === 'pending' && (
        <div className="flex flex-wrap gap-3">
          <button onClick={handleSend} disabled={sending} className="btn-primary flex items-center gap-2">
            {sending
              ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            }
            {sending ? 'Enviando...' : '📤 Enviar ahora'}
          </button>
          <button onClick={() => setShowEdit(true)} className="btn-secondary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            ✏️ Editar
          </button>
          <button onClick={() => { setShowReschedule(true); setNewDueDate('') }} className="btn-secondary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            📅 Mover fecha
          </button>
          <button onClick={() => setShowDelete(true)} className="btn-secondary text-red-400 hover:border-red-500/30 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            🗑️ Eliminar
          </button>
        </div>
      )}

      {/* Instances */}
      {task.instances.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Instancias diarias ({task.instances.length})</h2>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {task.instances.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between py-2 border-b border-[#111] last:border-0">
                <p className="text-sm text-gray-300">{new Date(inst.scheduledDate).toLocaleDateString('es-CO', { dateStyle: 'medium' })}</p>
                <div className="flex items-center gap-2">
                  {inst.morningReminderSentAt && <span className="text-[10px] text-green-400" title="Recordatorio mañana enviado">🌅</span>}
                  {inst.eveningReminderSentAt && <span className="text-[10px] text-orange-400" title="Recordatorio noche enviado">🌙</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded border ${inst.status === 'sent' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : inst.status === 'completed' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                    {inst.status === 'sent' ? 'Enviado' : inst.status === 'completed' ? 'Completado' : 'Pendiente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Edit */}
      <AnimatePresence>
        {showEdit && (
          <OverlayModal onClose={() => setShowEdit(false)}>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-white mb-4">✏️ Editar tarea</h2>
              <div className="space-y-3">
                <div>
                  <label className="label">Título</label>
                  <input className="input" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Descripción</label>
                  <textarea className="input min-h-[80px] resize-y" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Prioridad</label>
                  <select className="input" value={editForm.priority} onChange={(e) => setEditForm((p) => ({ ...p, priority: e.target.value }))}>
                    {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Fecha de inicio</label>
                    <input type="datetime-local" className="input" value={editForm.startDate} onChange={(e) => setEditForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Fecha límite</label>
                    <input type="datetime-local" className="input" value={editForm.dueDate} onChange={(e) => setEditForm((p) => ({ ...p, dueDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="label">Emails (uno por línea)</label>
                  <textarea className="input min-h-[70px] font-mono text-sm" value={editForm.employeeEmails} onChange={(e) => setEditForm((p) => ({ ...p, employeeEmails: e.target.value }))} />
                </div>
                <div>
                  <label className="label">URL adjunto</label>
                  <input className="input" value={editForm.attachmentUrl} onChange={(e) => setEditForm((p) => ({ ...p, attachmentUrl: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Notas internas</label>
                  <textarea className="input min-h-[60px]" value={editForm.internalNotes} onChange={(e) => setEditForm((p) => ({ ...p, internalNotes: e.target.value }))} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.isRecurring} onChange={(e) => setEditForm((p) => ({ ...p, isRecurring: e.target.checked }))} className="w-4 h-4 accent-purple-600" />
                  <span className="text-sm text-gray-300">Tarea recurrente</span>
                </label>
                {editForm.isRecurring && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div>
                      <label className="label">Frecuencia</label>
                      <select className="input" value={editForm.recurringRule} onChange={(e) => setEditForm((p) => ({ ...p, recurringRule: e.target.value }))}>
                        {RECURRING_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Fecha fin</label>
                      <input type="date" className="input" value={editForm.recurringEndDate} onChange={(e) => setEditForm((p) => ({ ...p, recurringEndDate: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={handleEdit} className="btn-primary flex-1">Guardar cambios</button>
                <button onClick={() => setShowEdit(false)} className="btn-secondary">Cancelar</button>
              </div>
            </div>
          </OverlayModal>
        )}
      </AnimatePresence>

      {/* MODAL: Reschedule */}
      <AnimatePresence>
        {showReschedule && (
          <OverlayModal onClose={() => setShowReschedule(false)}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-white mb-1">📅 Mover fecha</h2>
              <p className="text-gray-500 text-sm mb-4">{task.title}</p>
              <div className="mb-4">
                <label className="label">Nueva fecha límite</label>
                <input type="datetime-local" className="input" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleReschedule} disabled={!newDueDate} className="btn-primary flex-1 disabled:opacity-50">Confirmar</button>
                <button onClick={() => setShowReschedule(false)} className="btn-secondary">Cancelar</button>
              </div>
            </div>
          </OverlayModal>
        )}
      </AnimatePresence>

      {/* MODAL: Delete */}
      <AnimatePresence>
        {showDelete && (
          <OverlayModal onClose={() => setShowDelete(false)}>
            <div className="p-6">
              <h2 className="text-lg font-bold text-white mb-2">🗑️ Eliminar tarea</h2>
              <p className="text-gray-400 text-sm mb-1">¿Eliminar <strong className="text-gray-200">"{task.title}"</strong>?</p>
              <p className="text-gray-600 text-xs mb-6">Esta acción no se puede deshacer. Se eliminarán todas las instancias asociadas.</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                  Sí, eliminar
                </button>
                <button onClick={() => setShowDelete(false)} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </div>
          </OverlayModal>
        )}
      </AnimatePresence>
    </div>
  )
}
