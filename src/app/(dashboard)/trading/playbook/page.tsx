'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'

interface PlaybookEntry {
  id: string
  name: string
  conditions: string
  entry: string
  exit: string
  notes: string
}

const emptyForm = { name: '', conditions: '', entry: '', exit: '', notes: '' }

export default function PlaybookPage() {
  const { showToast } = useToast()
  const [entries, setEntries] = useState<PlaybookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<PlaybookEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { loadEntries() }, [])

  async function loadEntries() {
    setLoadError(false)
    setLoading(true)
    try {
      const res = await fetch('/api/playbook')
      if (!res.ok) throw new Error()
      setEntries(await res.json())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setEditEntry(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(entry: PlaybookEntry) {
    setEditEntry(entry)
    setForm({ name: entry.name, conditions: entry.conditions, entry: entry.entry, exit: entry.exit, notes: entry.notes })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editEntry) {
        await fetch(`/api/playbook/${editEntry.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        showToast('Setup actualizado', 'success')
      } else {
        await fetch('/api/playbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        showToast('Setup creado', 'success')
      }
      setModalOpen(false)
      loadEntries()
    } catch {
      showToast('Error al guardar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('¿Eliminar este setup?')) return
    try {
      await fetch(`/api/playbook/${id}`, { method: 'DELETE' })
      showToast('Setup eliminado', 'info')
      loadEntries()
    } catch {
      showToast('Error al eliminar', 'error')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 bg-[#1a1a1a] animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="card h-32 bg-[#1a1a1a] animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">Error al cargar el playbook</p>
        <button onClick={loadEntries} className="btn-secondary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Playbook de Trading</h1>
          <p className="text-gray-500 text-sm mt-0.5">Tus estrategias validadas — editables</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo setup
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">Sin setups aún. Crea tu primer setup de trading.</p>
          <button onClick={openCreate} className="btn-primary mt-4">Crear primer setup</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map((entry, idx) => {
            const isExpanded = expanded === entry.id
            const colors = ['blue', 'purple', 'green', 'orange', 'red', 'yellow']
            const colorKey = colors[idx % colors.length]
            const colorMap: Record<string, string> = {
              blue: 'bg-blue-600/10 border-blue-600/30 text-blue-400',
              purple: 'bg-purple-600/10 border-purple-600/30 text-purple-400',
              green: 'bg-green-600/10 border-green-600/30 text-green-400',
              orange: 'bg-orange-600/10 border-orange-600/30 text-orange-400',
              red: 'bg-red-600/10 border-red-600/30 text-red-400',
              yellow: 'bg-yellow-600/10 border-yellow-600/30 text-yellow-400',
            }

            return (
              <div key={entry.id} className={`card border ${colorMap[colorKey]}`}>
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : entry.id)}
                    className="flex-1 text-left"
                  >
                    <p className="font-bold text-white">{entry.name}</p>
                    {!isExpanded && entry.conditions && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{entry.conditions}</p>
                    )}
                  </button>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(entry)} className="text-gray-600 hover:text-gray-300 p-1 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => deleteEntry(entry.id)} className="text-gray-600 hover:text-red-400 p-1 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-2 text-xs">
                    {entry.conditions && (
                      <div>
                        <p className="text-gray-500 font-medium uppercase tracking-wide mb-1">Condiciones</p>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.conditions}</p>
                      </div>
                    )}
                    {entry.entry && (
                      <div>
                        <p className="text-gray-500 font-medium uppercase tracking-wide mb-1">Entrada</p>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.entry}</p>
                      </div>
                    )}
                    {entry.exit && (
                      <div>
                        <p className="text-gray-500 font-medium uppercase tracking-wide mb-1">Salida</p>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.exit}</p>
                      </div>
                    )}
                    {entry.notes && (
                      <div>
                        <p className="text-gray-500 font-medium uppercase tracking-wide mb-1">Notas</p>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{entry.notes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editEntry ? 'Editar setup' : 'Nuevo setup'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nombre del setup *</label>
            <input
              className="input w-full"
              placeholder="Ej: London Breakout"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Condiciones de entrada</label>
            <textarea
              className="input w-full resize-none"
              rows={3}
              placeholder="¿Qué debe cumplirse para tomar este trade?"
              value={form.conditions}
              onChange={(e) => setForm({ ...form, conditions: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Reglas de entrada</label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                placeholder="Cómo y dónde entrar"
                value={form.entry}
                onChange={(e) => setForm({ ...form, entry: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Reglas de salida</label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                placeholder="SL, TP, BE..."
                value={form.exit}
                onChange={(e) => setForm({ ...form, exit: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Notas adicionales</label>
            <textarea
              className="input w-full resize-none"
              rows={2}
              placeholder="Observaciones, ejemplos, errores comunes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : editEntry ? 'Actualizar' : 'Crear setup'}
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
