'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'

interface Company {
  id: string
  name: string
  emoji: string
}

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'Alta', color: 'text-red-400' },
  { value: 'medium', label: 'Media', color: 'text-yellow-400' },
  { value: 'low', label: 'Baja', color: 'text-green-400' },
]

const RECURRING_RULES = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Cada 2 semanas' },
  { value: 'monthly', label: 'Mensual' },
]

export default function NewCorporateTaskPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [companies, setCompanies] = useState<Company[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    companyId: '',
    employeeEmails: '',
    attachmentUrl: '',
    internalNotes: '',
    isRecurring: false,
    recurringRule: 'weekly',
    recurringEndDate: '',
  })

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data) => setCompanies(data))
      .catch(() => showToast('Error al cargar empresas', 'error'))
  }, [])

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return showToast('El título es requerido', 'error')
    if (!form.dueDate) return showToast('La fecha límite es requerida', 'error')
    if (!form.companyId) return showToast('Selecciona una empresa', 'error')

    const emails = form.employeeEmails
      .split('\n')
      .map((e) => e.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      const res = await fetch('/api/corporate-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priority: form.priority,
          dueDate: form.dueDate,
          companyId: form.companyId,
          employeeEmails: emails,
          attachmentUrl: form.attachmentUrl || undefined,
          internalNotes: form.internalNotes || undefined,
          isRecurring: form.isRecurring,
          recurringRule: form.isRecurring ? form.recurringRule : undefined,
          recurringEndDate: form.isRecurring && form.recurringEndDate ? form.recurringEndDate : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) return showToast(data.error ?? 'Error al crear tarea', 'error')

      showToast('Tarea creada correctamente', 'success')
      router.push('/corporate-tasks')
    } catch {
      showToast('Error al crear tarea', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/corporate-tasks" className="text-gray-500 hover:text-gray-300 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-white">Nueva Tarea Corporativa</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Información principal</h2>

          <div>
            <label className="label">Título *</label>
            <input
              className="input"
              placeholder="Ej: Revisar contrato Q3 2026"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input min-h-[100px] resize-y"
              placeholder="Detalle de la tarea, instrucciones para el equipo..."
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Prioridad</label>
              <select
                className="input"
                value={form.priority}
                onChange={(e) => setField('priority', e.target.value)}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Fecha límite *</label>
              <input
                type="datetime-local"
                className="input"
                value={form.dueDate}
                onChange={(e) => setField('dueDate', e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="label">Empresa *</label>
            <select
              className="input"
              value={form.companyId}
              onChange={(e) => setField('companyId', e.target.value)}
              required
            >
              <option value="">Seleccionar empresa...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Recipients */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Destinatarios</h2>

          <div>
            <label className="label">Emails de empleados (uno por línea)</label>
            <textarea
              className="input min-h-[80px] resize-y font-mono text-sm"
              placeholder="juan@empresa.com&#10;maria@empresa.com"
              value={form.employeeEmails}
              onChange={(e) => setField('employeeEmails', e.target.value)}
            />
          </div>
        </div>

        {/* Optional */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Opcionales</h2>

          <div>
            <label className="label">URL de adjunto</label>
            <input
              className="input"
              placeholder="https://drive.google.com/..."
              value={form.attachmentUrl}
              onChange={(e) => setField('attachmentUrl', e.target.value)}
            />
          </div>

          <div>
            <label className="label">Notas internas (no se envían por email)</label>
            <textarea
              className="input min-h-[70px] resize-y"
              placeholder="Solo visible para ti..."
              value={form.internalNotes}
              onChange={(e) => setField('internalNotes', e.target.value)}
            />
          </div>
        </div>

        {/* Recurring */}
        <div className="card space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isRecurring}
              onChange={(e) => setField('isRecurring', e.target.checked)}
              className="w-4 h-4 rounded accent-purple-600"
            />
            <div>
              <p className="text-sm font-medium text-gray-200">Tarea recurrente</p>
              <p className="text-xs text-gray-500">Se enviará automáticamente según la frecuencia</p>
            </div>
          </label>

          {form.isRecurring && (
            <div className="grid grid-cols-2 gap-4 pl-7">
              <div>
                <label className="label">Frecuencia</label>
                <select
                  className="input"
                  value={form.recurringRule}
                  onChange={(e) => setField('recurringRule', e.target.value)}
                >
                  {RECURRING_RULES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Fecha de fin</label>
                <input
                  type="date"
                  className="input"
                  value={form.recurringEndDate}
                  onChange={(e) => setField('recurringEndDate', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary flex items-center gap-2 flex-1 justify-center"
          >
            {saving ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
            {saving ? 'Creando...' : 'Crear Tarea'}
          </button>
          <Link href="/corporate-tasks" className="btn-secondary">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}
