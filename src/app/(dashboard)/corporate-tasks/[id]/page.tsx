'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'

interface CorporateTask {
  id: string
  title: string
  description: string
  priority: string
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
  instances: Array<{ id: string; scheduledDate: string; status: string; sentAt: string | null }>
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border-green-500/30',
}
const PRIORITY_LABELS: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

const RULE_LABELS: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Cada 2 semanas', monthly: 'Mensual',
}

export default function CorporateTaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { showToast } = useToast()
  const [task, setTask] = useState<CorporateTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    fetch(`/api/corporate-tasks/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) showToast(data.error, 'error')
        else setTask(data)
      })
      .catch(() => showToast('Error al cargar tarea', 'error'))
      .finally(() => setLoading(false))
  }, [params.id])

  async function handleSend() {
    if (!task) return
    setSending(true)
    try {
      const res = await fetch(`/api/corporate-tasks/${task.id}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error al enviar', 'error')
      showToast(`Enviado a ${data.sentCount} email(s)`, 'success')
      setTask((prev) => prev ? { ...prev, status: 'sent', sentAt: new Date().toISOString() } : prev)
    } catch {
      showToast('Error al enviar', 'error')
    } finally {
      setSending(false)
    }
  }

  async function handleDelete() {
    if (!task || !confirm('¿Eliminar esta tarea?')) return
    try {
      const res = await fetch(`/api/corporate-tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        return showToast(data.error ?? 'Error al eliminar', 'error')
      }
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

  const dueFmt = new Date(task.dueDate).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/corporate-tasks" className="text-gray-500 hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-white flex-1 min-w-0">
          {task.isRecurring && <span className="text-purple-400 mr-2">🔄</span>}
          {task.title}
        </h1>
        <span className={`text-xs px-2 py-1 rounded border ${PRIORITY_COLORS[task.priority] ?? ''}`}>
          {PRIORITY_LABELS[task.priority] ?? task.priority}
        </span>
      </div>

      {/* Main info */}
      <div className="card space-y-4">
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
            <p className="label mb-1">Fecha límite</p>
            <p className="text-gray-200 text-sm capitalize">{dueFmt}</p>
          </div>
        </div>

        <div>
          <p className="label mb-1">Destinatarios ({task.employeeEmails.length})</p>
          {task.employeeEmails.length === 0 ? (
            <p className="text-gray-600 text-sm">Sin destinatarios</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {task.employeeEmails.map((email) => (
                <span key={email} className="text-xs px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-gray-400">{email}</span>
              ))}
            </div>
          )}
        </div>

        {task.attachmentUrl && (
          <div>
            <p className="label mb-1">Adjunto</p>
            <a
              href={task.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Ver adjunto
            </a>
          </div>
        )}

        {task.status === 'pending' && task.internalNotes && (
          <div>
            <p className="label mb-1">Notas internas</p>
            <p className="text-gray-400 text-sm whitespace-pre-wrap bg-[#111] rounded-lg p-3 border border-[#1a1a1a]">{task.internalNotes}</p>
          </div>
        )}

        {task.isRecurring && task.recurringRule && (
          <div className="flex items-center gap-2 text-sm text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
            <span>🔄</span>
            <span>
              Recurrente: <strong>{RULE_LABELS[task.recurringRule] ?? task.recurringRule}</strong>
              {task.recurringEndDate && (
                <> hasta <strong>{new Date(task.recurringEndDate).toLocaleDateString('es-CO')}</strong></>
              )}
            </span>
          </div>
        )}

        {task.status === 'sent' && task.sentAt && (
          <div className="flex items-center gap-2 text-sm text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Enviado a {task.employeeEmails.length} email(s) el {new Date(task.sentAt).toLocaleDateString('es-CO', { dateStyle: 'long' })}
          </div>
        )}
      </div>

      {/* Actions */}
      {task.status === 'pending' && (
        <div className="flex gap-3">
          <button
            onClick={handleSend}
            disabled={sending}
            className="btn-primary flex items-center gap-2"
          >
            {sending ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            {sending ? 'Enviando...' : 'Enviar ahora'}
          </button>
          <button
            onClick={handleDelete}
            className="btn-secondary text-red-400 hover:text-red-300 hover:border-red-500/30 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eliminar
          </button>
        </div>
      )}

      {/* Recurring instances */}
      {task.isRecurring && task.instances.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Instancias recurrentes</h2>
          <div className="space-y-1">
            {task.instances.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between py-1.5 border-b border-[#111] last:border-0">
                <p className="text-sm text-gray-300">
                  {new Date(inst.scheduledDate).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                </p>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${
                  inst.status === 'sent' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {inst.status === 'sent' ? 'Enviado' : 'Pendiente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
