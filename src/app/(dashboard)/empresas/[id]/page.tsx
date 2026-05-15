'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

/* ────────────────────── Types ────────────────────── */

interface TeamMember { id: string; name: string; role: string }
interface CompanyLink { id: string; name: string; url: string; type: string; description: string | null }
interface Task {
  id: string; title: string; description: string | null
  priority: string; status: string; dueDate: string | null; createdAt: string
}
interface Note {
  id: string; title: string; content: string; createdAt: string; updatedAt: string
}
interface Company {
  id: string; name: string; description: string | null; longDesc: string | null
  emoji: string; color: string; status: string; industry: string | null
  website: string | null; foundedAt: string | null; tools: string[]
  privateNotes: string | null; teamMembers: TeamMember[]; links: CompanyLink[]
  tasks: Task[]; notes: Note[]
}

/* ────────────────────── Constants ────────────────────── */

const STATUS_LABELS: Record<string, string> = { activa: 'Activa', pausa: 'En pausa', idea: 'Idea' }
const STATUS_COLORS: Record<string, string> = {
  activa: 'bg-green-500/20 text-green-400 border-green-500/30',
  pausa: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  idea: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const PRIORITY_COLORS: Record<string, string> = {
  alta: 'text-red-400 bg-red-500/10 border-red-500/30',
  media: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  baja: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
}
const TASK_STATUS_COLORS: Record<string, string> = {
  pendiente: 'text-gray-200',
  'en-progreso': 'text-blue-400',
  completada: 'text-gray-500 line-through',
}
const LINK_ICONS: Record<string, string> = {
  'Google Drive': '📁', Notion: '📓', GitHub: '⌨️', Figma: '🎨', Web: '🌐', Otro: '🔗',
}
const INDUSTRIES = ['Consultoría', 'SaaS/Tech', 'Limpieza', 'Logística/Envíos', 'Inmobiliaria', 'E-commerce', 'Otro']
const LINK_TYPES = ['Google Drive', 'Notion', 'GitHub', 'Figma', 'Web', 'Otro']
const STATUSES = ['activa', 'pausa', 'idea']

/* ────────────────────── Page ────────────────────── */

export default function CompanyPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'tareas' | 'notas' | 'info' | 'archivos'>('tareas')
  const [editingCompany, setEditingCompany] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', description: '', emoji: '', color: '', status: '', industry: '' })

  useEffect(() => {
    if (!id) return
    loadCompany()
  }, [id])

  async function loadCompany() {
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${id}`)
      if (res.ok) {
        const data: Company = await res.json()
        setCompany(data)
        setEditForm({
          name: data.name,
          description: data.description ?? '',
          emoji: data.emoji,
          color: data.color,
          status: data.status,
          industry: data.industry ?? '',
        })
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function saveEditCompany() {
    const res = await fetch(`/api/companies/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      const updated = await res.json()
      setCompany((prev) => prev ? { ...prev, ...updated } : prev)
      setEditingCompany(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-[#1a1a1a] rounded-xl animate-pulse" />
        <div className="h-96 bg-[#1a1a1a] rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-gray-500">Empresa no encontrada</p>
        <Link href="/empresas" className="btn-primary inline-block">← Volver al mapa</Link>
      </div>
    )
  }

  const pendingCount = company.tasks.filter((t) => t.status !== 'completada').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: `${company.color}30` }}>
        <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${company.color}, transparent)` }} />
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${company.color}12 0%, transparent 60%)` }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl border-2 flex-shrink-0"
                style={{ borderColor: `${company.color}60`, background: `${company.color}18` }}
              >
                {company.emoji}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{company.name}</h1>
                {company.description && <p className="text-gray-400 text-sm mt-0.5">{company.description}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[company.status] ?? 'border-[#3a3a3a] text-gray-400'}`}>
                    {STATUS_LABELS[company.status] ?? company.status}
                  </span>
                  {company.industry && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-[#3a3a3a] text-gray-400">
                      {company.industry}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingCompany(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </button>
              <Link href="/empresas" className="btn-secondary text-sm flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Mapa
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2a2a2a]">
        {(['tareas', 'notas', 'info', 'archivos'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'tareas' ? 'Tareas' : tab === 'notas' ? 'Notas' : tab === 'info' ? 'Info' : 'Archivos'}
            {tab === 'tareas' && pendingCount > 0 && (
              <span className="ml-1.5 text-xs bg-[#2a2a2a] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
          {activeTab === 'tareas' && (
            <TasksTab companyId={id} tasks={company.tasks} color={company.color}
              onUpdate={(tasks) => setCompany((p) => p ? { ...p, tasks } : p)} />
          )}
          {activeTab === 'notas' && (
            <NotesTab companyId={id} notes={company.notes}
              onUpdate={(notes) => setCompany((p) => p ? { ...p, notes } : p)} />
          )}
          {activeTab === 'info' && (
            <InfoTab company={company} onUpdate={(u) => setCompany((p) => p ? { ...p, ...u } : p)} />
          )}
          {activeTab === 'archivos' && (
            <LinksTab companyId={id} links={company.links}
              onUpdate={(links) => setCompany((p) => p ? { ...p, links } : p)} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editingCompany && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditingCompany(false) }}
          >
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-md p-5 space-y-4"
            >
              <h2 className="text-lg font-bold text-white">Editar empresa</h2>
              <div>
                <label className="label">Nombre</label>
                <input className="input w-full" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <input className="input w-full" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div>
                <label className="label">Estado</label>
                <div className="flex gap-2">
                  {STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => setEditForm({ ...editForm, status: s })}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${editForm.status === s ? STATUS_COLORS[s] : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300'}`}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Industria</label>
                <select className="input w-full" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}>
                  {INDUSTRIES.map((ind) => <option key={ind}>{ind}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditingCompany(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={saveEditCompany} className="btn-primary flex-1">Guardar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ────────────────────── Tasks Tab ────────────────────── */

function TasksTab({ companyId, tasks, onUpdate, color }: { companyId: string; tasks: Task[]; onUpdate: (t: Task[]) => void; color: string }) {
  const [filter, setFilter] = useState('todas')
  const [sortBy, setSortBy] = useState('creacion')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('media')
  const [creating, setCreating] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, priority: newPriority }),
      })
      if (res.ok) {
        const task: Task = await res.json()
        onUpdate([task, ...tasks])
        setNewTitle('')
      }
    } catch (e) { console.error(e) }
    setCreating(false)
  }

  async function updateTask(taskId: string, updates: Partial<Task>) {
    try {
      const res = await fetch(`/api/companies/${companyId}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const updated: Task = await res.json()
        onUpdate(tasks.map((t) => t.id === taskId ? updated : t))
        setEditingTask(null)
      }
    } catch (e) { console.error(e) }
  }

  async function deleteTask(taskId: string) {
    try {
      await fetch(`/api/companies/${companyId}/tasks/${taskId}`, { method: 'DELETE' })
      onUpdate(tasks.filter((t) => t.id !== taskId))
    } catch (e) { console.error(e) }
  }

  const filtered = [...tasks]
    .filter((t) => filter === 'todas' || t.status === filter)
    .sort((a, b) => {
      if (sortBy === 'prioridad') {
        const o: Record<string, number> = { alta: 0, media: 1, baja: 2 }
        return (o[a.priority] ?? 1) - (o[b.priority] ?? 1)
      }
      if (sortBy === 'fecha' && a.dueDate && b.dueDate)
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  return (
    <div className="space-y-4">
      <form onSubmit={createTask} className="flex gap-2">
        <select className="input text-sm w-28" value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Media</option>
          <option value="baja">⚪ Baja</option>
        </select>
        <input className="input flex-1 text-sm" placeholder="Nueva tarea..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <button type="submit" disabled={creating || !newTitle.trim()} className="btn-primary text-sm px-4 disabled:opacity-50">Agregar</button>
      </form>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1 flex-wrap">
          {[{ k: 'todas', l: 'Todas' }, { k: 'pendiente', l: 'Pendientes' }, { k: 'en-progreso', l: 'En progreso' }, { k: 'completada', l: 'Completadas' }].map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)}
              className={`px-3 py-1 rounded-lg text-xs transition-colors ${filter === f.k ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30' : 'text-gray-500 hover:text-gray-300'}`}>
              {f.l}
            </button>
          ))}
        </div>
        <select className="input text-xs py-1 w-36" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="creacion">Por creación</option>
          <option value="prioridad">Por prioridad</option>
          <option value="fecha">Por fecha límite</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-10"><p className="text-gray-500">Sin tareas {filter !== 'todas' ? 'en este estado' : 'aún'}</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div key={task.id} className="card flex items-start gap-3 group"
              style={task.priority === 'alta' ? { borderLeft: `2px solid ${color}` } : {}}>
              <button
                onClick={() => {
                  const next = task.status === 'pendiente' ? 'en-progreso' : task.status === 'en-progreso' ? 'completada' : 'pendiente'
                  updateTask(task.id, { ...task, status: next })
                }}
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  task.status === 'completada' ? 'bg-green-500 border-green-500' : task.status === 'en-progreso' ? 'border-blue-500' : 'border-[#444]'
                }`}
              >
                {task.status === 'completada' && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                {task.status === 'en-progreso' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${TASK_STATUS_COLORS[task.status] ?? 'text-gray-200'}`}>{task.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority] ?? ''}`}>{task.priority}</span>
                </div>
                {task.description && <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>}
                {task.dueDate && <p className="text-xs text-gray-600 mt-0.5">📅 {new Date(task.dueDate).toLocaleDateString('es-CO')}</p>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => setEditingTask(task)} className="text-gray-600 hover:text-gray-300 p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => deleteTask(task.id)} className="text-gray-600 hover:text-red-400 p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editingTask && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditingTask(null) }}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-md p-5 space-y-3">
              <h3 className="text-base font-bold text-white">Editar tarea</h3>
              <input className="input w-full" value={editingTask.title} onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })} />
              <textarea className="input w-full resize-none" rows={2} placeholder="Descripción (opcional)"
                value={editingTask.description ?? ''} onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Prioridad</label>
                  <select className="input w-full" value={editingTask.priority} onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value })}>
                    <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select className="input w-full" value={editingTask.status} onChange={(e) => setEditingTask({ ...editingTask, status: e.target.value })}>
                    <option value="pendiente">Pendiente</option><option value="en-progreso">En progreso</option><option value="completada">Completada</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Fecha límite</label>
                <input type="date" className="input w-full" value={editingTask.dueDate ? editingTask.dueDate.split('T')[0] : ''}
                  onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value || null })} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditingTask(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => updateTask(editingTask.id, editingTask)} className="btn-primary flex-1">Guardar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ────────────────────── Notes Tab ────────────────────── */

function NotesTab({ companyId, notes, onUpdate }: { companyId: string; notes: Note[]; onUpdate: (n: Note[]) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [newNote, setNewNote] = useState({ title: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [editingNote, setEditingNote] = useState<Note | null>(null)

  async function createNote(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.title.trim() || !newNote.content.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newNote),
      })
      if (res.ok) {
        const note: Note = await res.json()
        onUpdate([note, ...notes])
        setNewNote({ title: '', content: '' })
        setShowForm(false)
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  async function updateNote() {
    if (!editingNote) return
    try {
      const res = await fetch(`/api/companies/${companyId}/notes/${editingNote.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingNote.title, content: editingNote.content }),
      })
      if (res.ok) {
        const updated: Note = await res.json()
        onUpdate(notes.map((n) => n.id === editingNote.id ? updated : n))
        setEditingNote(null)
      }
    } catch (e) { console.error(e) }
  }

  async function deleteNote(noteId: string) {
    try {
      await fetch(`/api/companies/${companyId}/notes/${noteId}`, { method: 'DELETE' })
      onUpdate(notes.filter((n) => n.id !== noteId))
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-500 text-sm">{notes.length} nota{notes.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancelar' : '+ Nueva nota'}</button>
      </div>
      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={createNote} className="card space-y-3 overflow-hidden">
            <input className="input w-full" placeholder="Título de la nota" value={newNote.title} onChange={(e) => setNewNote({ ...newNote, title: e.target.value })} />
            <textarea className="input w-full resize-none" rows={5} placeholder="Contenido..." value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })} />
            <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar nota'}</button>
          </motion.form>
        )}
      </AnimatePresence>
      {notes.length === 0 ? (
        <div className="card text-center py-10"><p className="text-gray-500">Sin notas aún</p></div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="card group space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-white font-semibold text-sm">{note.title}</h3>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => setEditingNote(note)} className="text-gray-600 hover:text-gray-300 p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                  <button onClick={() => deleteNote(note.id)} className="text-gray-600 hover:text-red-400 p-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
              <p className="text-gray-600 text-xs">{new Date(note.updatedAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {editingNote && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditingNote(null) }}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-lg p-5 space-y-3">
              <h3 className="text-base font-bold text-white">Editar nota</h3>
              <input className="input w-full" value={editingNote.title} onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })} />
              <textarea className="input w-full resize-none" rows={8} value={editingNote.content} onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })} />
              <div className="flex gap-3">
                <button onClick={() => setEditingNote(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={updateNote} className="btn-primary flex-1">Guardar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ────────────────────── Info Tab ────────────────────── */

function InfoTab({ company, onUpdate }: { company: Company; onUpdate: (d: Partial<Company>) => void }) {
  const [form, setForm] = useState({
    name: company.name,
    description: company.description ?? '',
    longDesc: company.longDesc ?? '',
    website: company.website ?? '',
    industry: company.industry ?? '',
    status: company.status,
    foundedAt: company.foundedAt ? company.foundedAt.split('T')[0] : '',
    tools: [...company.tools],
    privateNotes: company.privateNotes ?? '',
    teamMembers: company.teamMembers.map((m) => ({ ...m })),
  })
  const [newTool, setNewTool] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/companies/${company.id}/info`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, links: company.links }),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="label">Nombre completo</label><input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">Sitio web</label><input className="input w-full" placeholder="https://..." value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
        <div>
          <label className="label">Industria</label>
          <select className="input w-full" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
            {INDUSTRIES.map((ind) => <option key={ind}>{ind}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input w-full" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div><label className="label">Fecha de inicio</label><input type="date" className="input w-full" value={form.foundedAt} onChange={(e) => setForm({ ...form, foundedAt: e.target.value })} /></div>
      </div>
      <div><label className="label">Descripción corta</label><input className="input w-full" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div><label className="label">Descripción larga</label><textarea className="input w-full resize-none" rows={4} value={form.longDesc} onChange={(e) => setForm({ ...form, longDesc: e.target.value })} /></div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Equipo</label>
          <button onClick={() => setForm({ ...form, teamMembers: [...form.teamMembers, { id: '', name: '', role: '' }] })} className="text-xs text-blue-400 hover:text-blue-300">+ Agregar</button>
        </div>
        <div className="space-y-2">
          {form.teamMembers.map((member, i) => (
            <div key={i} className="flex gap-2">
              <input className="input flex-1 text-sm" placeholder="Nombre" value={member.name}
                onChange={(e) => { const u = [...form.teamMembers]; u[i] = { ...u[i], name: e.target.value }; setForm({ ...form, teamMembers: u }) }} />
              <input className="input flex-1 text-sm" placeholder="Rol" value={member.role}
                onChange={(e) => { const u = [...form.teamMembers]; u[i] = { ...u[i], role: e.target.value }; setForm({ ...form, teamMembers: u }) }} />
              <button onClick={() => setForm({ ...form, teamMembers: form.teamMembers.filter((_, j) => j !== i) })} className="text-gray-600 hover:text-red-400 px-2 text-lg">×</button>
            </div>
          ))}
          {form.teamMembers.length === 0 && <p className="text-sm text-gray-600">Sin miembros de equipo</p>}
        </div>
      </div>

      <div>
        <label className="label">Herramientas</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.tools.map((tool, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-sm text-gray-300">
              {tool}
              <button onClick={() => setForm({ ...form, tools: form.tools.filter((_, j) => j !== i) })} className="text-gray-600 hover:text-red-400 ml-1">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1 text-sm" placeholder="Ej: Next.js, Stripe, Railway..." value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newTool.trim()) { setForm({ ...form, tools: [...form.tools, newTool.trim()] }); setNewTool('') } } }} />
          <button onClick={() => { if (newTool.trim()) { setForm({ ...form, tools: [...form.tools, newTool.trim()] }); setNewTool('') } }} className="btn-secondary text-sm px-3">Agregar</button>
        </div>
      </div>

      <div><label className="label">Notas privadas del fundador</label><textarea className="input w-full resize-none" rows={5} placeholder="Reflexiones, ideas, contexto privado..." value={form.privateNotes} onChange={(e) => setForm({ ...form, privateNotes: e.target.value })} /></div>

      <button onClick={save} disabled={saving}
        className={`btn-primary w-full disabled:opacity-50 transition-all ${saved ? '!bg-green-600' : ''}`}>
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
      </button>
    </div>
  )
}

/* ────────────────────── Links Tab ────────────────────── */

function LinksTab({ companyId, links, onUpdate }: { companyId: string; links: CompanyLink[]; onUpdate: (l: CompanyLink[]) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [newLink, setNewLink] = useState({ name: '', url: '', type: 'Web', description: '' })
  const [saving, setSaving] = useState(false)

  async function addLink(e: React.FormEvent) {
    e.preventDefault()
    if (!newLink.name.trim() || !newLink.url.trim()) return
    setSaving(true)
    try {
      const payload = [...links, { id: '', ...newLink }]
      const res = await fetch(`/api/companies/${companyId}/info`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links: payload }),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated.links)
        setNewLink({ name: '', url: '', type: 'Web', description: '' })
        setShowForm(false)
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  async function deleteLink(linkId: string) {
    try {
      const res = await fetch(`/api/companies/${companyId}/info`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: links.filter((l) => l.id !== linkId) }),
      })
      if (res.ok) { const updated = await res.json(); onUpdate(updated.links) }
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-500 text-sm">{links.length} recurso{links.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? 'Cancelar' : '+ Agregar link'}</button>
      </div>
      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            onSubmit={addLink} className="card space-y-3 overflow-hidden">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Nombre</label><input className="input w-full" placeholder="Ej: Diseños en Figma" value={newLink.name} onChange={(e) => setNewLink({ ...newLink, name: e.target.value })} /></div>
              <div>
                <label className="label">Tipo</label>
                <select className="input w-full" value={newLink.type} onChange={(e) => setNewLink({ ...newLink, type: e.target.value })}>
                  {LINK_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">URL</label><input className="input w-full" placeholder="https://..." value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} /></div>
            <div><label className="label">Descripción (opcional)</label><input className="input w-full" placeholder="¿Qué hay aquí?" value={newLink.description} onChange={(e) => setNewLink({ ...newLink, description: e.target.value })} /></div>
            <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">{saving ? 'Guardando...' : 'Agregar recurso'}</button>
          </motion.form>
        )}
      </AnimatePresence>
      {links.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500">Sin recursos aún</p>
          <p className="text-gray-600 text-xs mt-1">Agrega links a Google Drive, Notion, GitHub, Figma…</p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div key={link.id} className="card flex items-center gap-3 group">
              <span className="text-2xl flex-shrink-0">{LINK_ICONS[link.type] ?? '🔗'}</span>
              <div className="flex-1 min-w-0">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-white text-sm font-medium hover:text-blue-400 transition-colors">{link.name}</a>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-600">{link.type}</span>
                  {link.description && <span className="text-xs text-gray-600">· {link.description}</span>}
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-400 p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
                <button onClick={() => deleteLink(link.id)} className="text-gray-600 hover:text-red-400 p-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
