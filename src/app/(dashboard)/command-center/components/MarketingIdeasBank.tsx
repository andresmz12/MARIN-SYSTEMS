'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { CEOCompany, MarketingIdea } from '../types'
import { IDEA_TYPE_CONFIG, IDEA_STATUS_CONFIG, IDEA_TYPE_OPTIONS } from '../utils'

interface Props {
  companies: CEOCompany[]
  onChanged?: () => void
}

export function MarketingIdeasBank({ companies, onChanged }: Props) {
  const { showToast } = useToast()
  const [ideas, setIdeas] = useState<MarketingIdea[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [scheduleFor, setScheduleFor] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ceo/ideas')
      if (res.ok) setIdeas(await res.json())
    } catch {
      showToast('Error al cargar ideas', 'error')
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => { load() }, [load])

  const patchIdea = useCallback(async (id: string, body: Record<string, unknown>, msg: string) => {
    try {
      const res = await fetch(`/api/ceo/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const updated: MarketingIdea = await res.json()
      setIdeas((prev) => prev.map((i) => (i.id === id ? updated : i)))
      showToast(msg, 'success')
      onChanged?.()
    } catch {
      showToast('Error al actualizar idea', 'error')
    }
  }, [showToast, onChanged])

  async function confirmDelete() {
    if (!deleteId) return
    const id = deleteId
    setDeleteId(null)
    try {
      const res = await fetch(`/api/ceo/ideas/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setIdeas((prev) => prev.filter((i) => i.id !== id))
      showToast('Idea eliminada', 'success')
      onChanged?.()
    } catch {
      showToast('Error al eliminar idea', 'error')
    }
  }

  const visible = activeTab === 'all' ? ideas : ideas.filter((i) => i.companyId === activeTab)

  return (
    <div>
      {/* Company tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Tab active={activeTab === 'all'} onClick={() => setActiveTab('all')} label="📋 Todas" />
        {companies.map((c) => (
          <Tab
            key={c.id}
            active={activeTab === c.id}
            onClick={() => setActiveTab(c.id)}
            label={`${c.emoji} ${c.name}`}
          />
        ))}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">
          No hay ideas todavía. Usa el botón + para crear la primera.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              scheduling={scheduleFor === idea.id}
              onToggleSchedule={() => setScheduleFor((p) => (p === idea.id ? null : idea.id))}
              onSchedule={(date) => {
                setScheduleFor(null)
                patchIdea(idea.id, { scheduledDate: date, convertedToTask: true }, 'Idea agendada')
              }}
              onAdvance={() => patchIdea(idea.id, { status: 'in_progress' }, 'Idea en progreso')}
              onDone={() => patchIdea(idea.id, { status: 'done' }, 'Idea completada')}
              onDelete={() => setDeleteId(idea.id)}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-8 right-8 z-30 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 flex items-center justify-center text-white text-2xl transition-all hover:scale-110"
        title="Nueva idea"
      >
        +
      </button>

      <AnimatePresence>
        {showModal && (
          <NewIdeaModal
            companies={companies}
            onClose={() => setShowModal(false)}
            onCreated={(idea) => {
              setIdeas((prev) => [idea, ...prev])
              setShowModal(false)
              showToast('Idea creada', 'success')
              onChanged?.()
            }}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Eliminar idea"
        message="¿Seguro que quieres eliminar esta idea? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
        active ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
      }`}
    >
      {label}
    </button>
  )
}

function PriorityDots({ priority }: { priority: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: n <= priority ? '#fbbf24' : '#3f3f46' }}
        />
      ))}
    </div>
  )
}

interface CardProps {
  idea: MarketingIdea
  scheduling: boolean
  onToggleSchedule: () => void
  onSchedule: (date: string) => void
  onAdvance: () => void
  onDone: () => void
  onDelete: () => void
}

function IdeaCard({ idea, scheduling, onToggleSchedule, onSchedule, onAdvance, onDone, onDelete }: CardProps) {
  const typeCfg = IDEA_TYPE_CONFIG[idea.type] ?? IDEA_TYPE_CONFIG.other
  const statusCfg = IDEA_STATUS_CONFIG[idea.status] ?? IDEA_STATUS_CONFIG.idea

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-3.5 flex flex-col gap-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{idea.title}</p>
          {idea.company && <p className="text-[11px] text-zinc-500">{idea.company.emoji} {idea.company.name}</p>}
        </div>
        <button onClick={onDelete} className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0" title="Eliminar">
          🗑️
        </button>
      </div>

      {idea.description && <p className="text-xs text-zinc-400 line-clamp-2">{idea.description}</p>}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeCfg.cls}`}>{typeCfg.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusCfg.cls}`}>{statusCfg.label}</span>
        {idea.convertedToTask && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-500/10 text-green-400/80 border-green-500/30">📅 agendada</span>
        )}
        <span className="ml-auto"><PriorityDots priority={idea.priority} /></span>
      </div>

      {scheduling && (
        <input
          type="date"
          autoFocus
          onChange={(e) => e.target.value && onSchedule(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
        />
      )}

      <div className="flex items-center gap-1.5 pt-0.5">
        {idea.status === 'idea' && (
          <button onClick={onAdvance} className="text-xs px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors">
            ▶ En progreso
          </button>
        )}
        {idea.status === 'in_progress' && (
          <button onClick={onDone} className="text-xs px-2 py-1 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
            ✅ Listo
          </button>
        )}
        <button onClick={onToggleSchedule} className="text-xs px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
          📅 Agendar
        </button>
      </div>
    </motion.div>
  )
}

interface ModalProps {
  companies: CEOCompany[]
  onClose: () => void
  onCreated: (idea: MarketingIdea) => void
}

function NewIdeaModal({ companies, onClose, onCreated }: ModalProps) {
  const { showToast } = useToast()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('reel')
  const [priority, setPriority] = useState(3)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !companyId) return
    setSaving(true)
    try {
      const res = await fetch('/api/ceo/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, title, description: description || null, type, priority }),
      })
      if (!res.ok) throw new Error()
      onCreated(await res.json())
    } catch {
      showToast('Error al crear idea', 'error')
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md"
      >
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Nueva idea de marketing</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Empresa</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Título</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required
              placeholder="Ej: Reel sobre tips de impuestos"
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Descripción</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="Detalles de la idea…"
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              {IDEA_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Prioridad: {priority}</label>
            <input type="range" min={1} max={5} step={1} value={priority}
              onChange={(e) => setPriority(Number(e.target.value))} className="w-full accent-indigo-500" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Cancelar</button>
            <button type="submit" disabled={saving || !title.trim()} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
