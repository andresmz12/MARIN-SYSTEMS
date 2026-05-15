'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'

interface CompanyTask { id: string; status: string; priority: string }
interface Company {
  id: string; name: string; emoji: string; color: string
  status: string; industry: string | null; description: string | null
  tasks: CompanyTask[]
}
interface CanvasNote {
  id: string; text: string; x: number; y: number; colorIdx: number
}

type Positions = Record<string, { x: number; y: number }>

const EMOJIS = ['🏢', '📊', '🧾', '🧹', '📦', '🏠', '💼', '🚀', '🌎', '💰', '🛒', '📱', '🎯', '⚡', '🔧']
const COLORS = [
  { label: 'Azul', value: '#2563eb' }, { label: 'Violeta', value: '#7c3aed' },
  { label: 'Verde', value: '#16a34a' }, { label: 'Naranja', value: '#ea580c' },
  { label: 'Cyan', value: '#0891b2' }, { label: 'Dorado', value: '#ca8a04' },
  { label: 'Rojo', value: '#dc2626' }, { label: 'Rosa', value: '#db2777' },
  { label: 'Teal', value: '#0d9488' }, { label: 'Gris', value: '#6b7280' },
]
const INDUSTRIES = ['Consultoría', 'SaaS/Tech', 'Limpieza', 'Logística/Envíos', 'Inmobiliaria', 'E-commerce', 'Otro']
const STATUSES = ['activa', 'pausa', 'idea'] as const
const STATUS_LABELS: Record<string, string> = { activa: 'Activa', pausa: 'En pausa', idea: 'Idea' }
const STATUS_COLORS: Record<string, string> = {
  activa: 'bg-green-500/20 text-green-400 border-green-500/30',
  pausa: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  idea: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}
const NOTE_COLORS = [
  { bg: '#1a1500', border: '#ca8a04', text: '#fde68a' },
  { bg: '#0d1a2e', border: '#3b82f6', text: '#93c5fd' },
  { bg: '#0a1a0d', border: '#22c55e', text: '#86efac' },
  { bg: '#1a0a1a', border: '#a855f7', text: '#d8b4fe' },
  { bg: '#1a0d0a', border: '#f97316', text: '#fed7aa' },
]

const POS_KEY = 'marin-empresa-positions'
const CENTER_KEY = 'marin-center-pos'
const NOTES_KEY = 'marin-canvas-notes'
const LABELS_KEY = 'marin-line-labels'

function getNodePos(index: number, total: number, cx: number, cy: number, radius: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

function ls<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* noop */ }
}

export default function EmpresasPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const containerRef = useRef<HTMLDivElement>(null)

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [dims, setDims] = useState({ w: 800, h: 580 })
  const [positions, setPositions] = useState<Positions>({})
  const [centerPos, setCenterPos] = useState({ x: 400, y: 290 })
  const [canvasNotes, setCanvasNotes] = useState<CanvasNote[]>([])
  const [lineLabels, setLineLabels] = useState<Record<string, string>>({})
  const [editingLabel, setEditingLabel] = useState<string | null>(null)
  const [hoveredLine, setHoveredLine] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', emoji: '🏢', color: '#2563eb', status: 'activa', industry: 'Consultoría' })
  const [saving, setSaving] = useState(false)

  const updateDims = useCallback(() => {
    if (containerRef.current) setDims({ w: containerRef.current.offsetWidth || 800, h: 580 })
  }, [])

  useEffect(() => {
    loadCompanies()
    setCanvasNotes(ls<CanvasNote[]>(NOTES_KEY, []))
    setLineLabels(ls<Record<string, string>>(LABELS_KEY, {}))
    const onResize = () => { setIsMobile(window.innerWidth < 768); updateDims() }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [updateDims])

  useEffect(() => { updateDims() }, [companies, updateDims])

  useEffect(() => {
    const saved = ls<{ x: number; y: number } | null>(CENTER_KEY, null)
    setCenterPos(saved ?? { x: dims.w / 2, y: dims.h / 2 })
  }, [dims.w, dims.h])

  useEffect(() => {
    if (!companies.length) return
    const cx = dims.w / 2; const cy = dims.h / 2
    const radius = Math.min(cx - 80, cy - 80, 220)
    const saved = ls<Positions>(POS_KEY, {})
    const next: Positions = {}
    companies.forEach((c, i) => { next[c.id] = saved[c.id] || getNodePos(i, companies.length, cx, cy, radius) })
    setPositions(next)
  }, [companies.length, dims.w, dims.h])

  async function loadCompanies() {
    setLoading(true)
    try {
      const res = await fetch('/api/companies')
      if (res.ok) setCompanies(await res.json())
    } catch { showToast('Error al cargar empresas', 'error') }
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error()
      const company: Company = await res.json()
      setCompanies((prev) => [...prev, company])
      setShowModal(false)
      setForm({ name: '', description: '', emoji: '🏢', color: '#2563eb', status: 'activa', industry: 'Consultoría' })
      showToast('Empresa creada', 'success')
    } catch { showToast('Error al crear empresa', 'error') }
    setSaving(false)
  }

  function handleNodeDragEnd(id: string, newX: number, newY: number) {
    setPositions((prev) => { const u = { ...prev, [id]: { x: newX, y: newY } }; lsSet(POS_KEY, u); return u })
  }

  function handleCenterDragEnd(newX: number, newY: number) {
    const pos = { x: newX, y: newY }; setCenterPos(pos); lsSet(CENTER_KEY, pos)
  }

  function addNote() {
    const note: CanvasNote = { id: Date.now().toString(), text: '', x: centerPos.x - 80, y: centerPos.y - 60, colorIdx: 0 }
    setCanvasNotes((prev) => { const u = [...prev, note]; lsSet(NOTES_KEY, u); return u })
  }

  function updateNote(id: string, updates: Partial<CanvasNote>) {
    setCanvasNotes((prev) => { const u = prev.map((n) => n.id === id ? { ...n, ...updates } : n); lsSet(NOTES_KEY, u); return u })
  }

  function deleteNote(id: string) {
    setCanvasNotes((prev) => { const u = prev.filter((n) => n.id !== id); lsSet(NOTES_KEY, u); return u })
  }

  function saveLabel(id: string, text: string) {
    setLineLabels((prev) => { const u = { ...prev, [id]: text.trim() }; lsSet(LABELS_KEY, u); return u })
    setEditingLabel(null)
  }

  function resetPositions() {
    const cx = dims.w / 2; const cy = dims.h / 2
    const radius = Math.min(cx - 80, cy - 80, 220)
    const next: Positions = {}
    companies.forEach((c, i) => { next[c.id] = getNodePos(i, companies.length, cx, cy, radius) })
    setPositions(next); setCenterPos({ x: cx, y: cy })
    try { localStorage.removeItem(POS_KEY); localStorage.removeItem(CENTER_KEY) } catch { /* noop */ }
  }

  const activeCount = companies.filter((c) => c.status === 'activa').length

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-[#2a2a2a] rounded animate-pulse" />
          <div className="h-9 w-36 bg-[#2a2a2a] rounded animate-pulse" />
        </div>
        <div className="h-[580px] bg-[#1a1a1a] rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🗺️ Empresas</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} · {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isMobile && companies.length > 0 && (
            <>
              <button onClick={addNote} className="btn-secondary text-xs flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Nota
              </button>
              <button onClick={resetPositions} className="btn-secondary text-xs flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Resetear mapa
              </button>
            </>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva empresa
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border border-[#2a2a2a]"
        style={{ minHeight: 580, background: 'radial-gradient(ellipse at center, #0d1a2e 0%, #080808 70%)' }}
      >
        {companies.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="text-6xl opacity-20">🏢</div>
            <p className="text-gray-500 text-lg">Aún no tienes empresas</p>
            <button onClick={() => setShowModal(true)} className="btn-primary">Crea tu primera empresa</button>
          </div>
        ) : isMobile ? (
          <div className="p-6 grid grid-cols-2 gap-4">
            {companies.map((company) => {
              const pending = company.tasks.filter((t) => t.status !== 'completada').length
              return (
                <button key={company.id} onClick={() => router.push(`/empresas/${company.id}`)}
                  className="rounded-xl border p-4 text-left transition-all hover:scale-105"
                  style={{ borderColor: company.color + '50', background: company.color + '10' }}>
                  <div className="text-3xl mb-2">{company.emoji}</div>
                  <p className="text-white text-sm font-semibold leading-tight">{company.name}</p>
                  {pending > 0 && <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">{pending} tarea{pending !== 1 ? 's' : ''}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            {/* SVG — arrows + labels */}
            <svg width={dims.w} height={dims.h} className="absolute inset-0" style={{ zIndex: 1 }}>
              <defs>
                <radialGradient id="cglow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </radialGradient>
                {companies.map((company) => (
                  <marker key={company.id} id={`arrow-${company.id}`}
                    markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0.5 L6,3.5 L0,6.5 Z"
                      fill={company.color}
                      fillOpacity={hoveredLine === company.id ? 0.9 : 0.55} />
                  </marker>
                ))}
                {companies.map((company) => {
                  const pos = positions[company.id]
                  if (!pos) return null
                  const dx = pos.x - centerPos.x; const dy = pos.y - centerPos.y
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1
                  const x1 = centerPos.x + (dx / dist) * 58
                  const y1 = centerPos.y + (dy / dist) * 58
                  const x2 = pos.x - (dx / dist) * 48
                  const y2 = pos.y - (dy / dist) * 48
                  return (
                    <linearGradient key={company.id} id={`grad-${company.id}`}
                      x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={hoveredLine === company.id ? 0.7 : 0.35} />
                      <stop offset="100%" stopColor={company.color} stopOpacity={hoveredLine === company.id ? 0.9 : 0.5} />
                    </linearGradient>
                  )
                })}
              </defs>

              <circle cx={centerPos.x} cy={centerPos.y} r={130} fill="url(#cglow)" />

              {companies.map((company) => {
                const pos = positions[company.id]
                if (!pos) return null
                const dx = pos.x - centerPos.x; const dy = pos.y - centerPos.y
                const dist = Math.sqrt(dx * dx + dy * dy) || 1
                const nx = dx / dist; const ny = dy / dist

                const x1 = centerPos.x + nx * 58
                const y1 = centerPos.y + ny * 58
                const x2 = pos.x - nx * 48
                const y2 = pos.y - ny * 48

                const midX = (x1 + x2) / 2
                const midY = (y1 + y2) / 2

                const label = lineLabels[company.id] || ''
                const isHovered = hoveredLine === company.id
                const isEditing = editingLabel === company.id

                return (
                  <g key={company.id}>
                    {/* Glow on hover */}
                    {isHovered && (
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={company.color} strokeWidth={6} strokeOpacity={0.12}
                        strokeLinecap="round" />
                    )}

                    {/* Main arrow line */}
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke={`url(#grad-${company.id})`}
                      strokeWidth={isHovered ? 2 : 1.5}
                      strokeDasharray={isHovered ? 'none' : '7 4'}
                      strokeLinecap="round"
                      markerEnd={`url(#arrow-${company.id})`}
                      style={{ transition: 'stroke-width 0.15s' }}
                    />

                    {/* Invisible wide hit area */}
                    <line x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="transparent" strokeWidth={20}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredLine(company.id)}
                      onMouseLeave={() => setHoveredLine(null)}
                      onClick={() => setEditingLabel(company.id)} />

                    {/* Label pill */}
                    {label && !isEditing && (
                      <g
                        style={{ cursor: 'pointer' }}
                        onClick={() => setEditingLabel(company.id)}
                        onMouseEnter={() => setHoveredLine(company.id)}
                        onMouseLeave={() => setHoveredLine(null)}
                      >
                        <rect
                          x={midX - (label.length * 3.6 + 8)}
                          y={midY - 9}
                          width={label.length * 7.2 + 16}
                          height={18}
                          rx={9}
                          fill={company.color}
                          fillOpacity={0.15}
                          stroke={company.color}
                          strokeOpacity={0.4}
                          strokeWidth={1}
                        />
                        <text x={midX} y={midY + 4.5}
                          textAnchor="middle"
                          fontSize={10}
                          fontFamily="system-ui, sans-serif"
                          fontWeight={500}
                          fill={company.color}
                          fillOpacity={0.95}
                        >{label}</text>
                      </g>
                    )}

                    {/* "+" add label hint (when no label and line is hovered) */}
                    {!label && !isEditing && isHovered && (
                      <g style={{ cursor: 'pointer' }} onClick={() => setEditingLabel(company.id)}>
                        <rect x={midX - 20} y={midY - 9} width={40} height={18} rx={9}
                          fill="#1a1a1a" stroke={company.color} strokeOpacity={0.4} strokeWidth={1} />
                        <text x={midX} y={midY + 4.5} textAnchor="middle"
                          fontSize={10} fontFamily="system-ui, sans-serif"
                          fill={company.color} fillOpacity={0.7}>+ texto</text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Label editor overlay */}
            {editingLabel && (() => {
              const pos = positions[editingLabel]
              if (!pos) return null
              const midX = (centerPos.x + pos.x) / 2
              const midY = (centerPos.y + pos.y) / 2
              const company = companies.find((c) => c.id === editingLabel)
              return (
                <div
                  style={{ position: 'absolute', left: midX, top: midY, transform: 'translate(-50%, -50%)', zIndex: 30 }}
                >
                  <input
                    autoFocus
                    defaultValue={lineLabels[editingLabel] || ''}
                    onBlur={(e) => saveLabel(editingLabel, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveLabel(editingLabel, e.currentTarget.value)
                      if (e.key === 'Escape') setEditingLabel(null)
                    }}
                    className="bg-[#0f0f0f] rounded-full px-3 py-1 text-xs text-white outline-none w-36 text-center placeholder-gray-600"
                    style={{ border: `1px solid ${company?.color ?? '#2563eb'}60`, boxShadow: `0 0 12px ${company?.color ?? '#2563eb'}30` }}
                    placeholder="Etiqueta..."
                  />
                </div>
              )
            })()}

            {/* Canvas notes */}
            {canvasNotes.map((note) => (
              <CanvasNoteEl key={note.id} note={note} containerRef={containerRef} onUpdate={updateNote} onDelete={deleteNote} />
            ))}

            {/* Center node */}
            <CenterNode x={centerPos.x} y={centerPos.y} containerRef={containerRef} onDragEnd={handleCenterDragEnd} />

            {/* Hint */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-gray-700 pointer-events-none select-none" style={{ zIndex: 2 }}>
              Arrastra elementos · Clic en flecha para añadir texto
            </div>

            {/* Company nodes */}
            {companies.map((company, i) => {
              const pos = positions[company.id]
              if (!pos) return null
              const pending = company.tasks.filter((t) => t.status !== 'completada').length
              return (
                <CompanyNode key={company.id} company={company} x={pos.x} y={pos.y} delay={i * 0.1}
                  pending={pending} containerRef={containerRef}
                  onClick={() => router.push(`/empresas/${company.id}`)}
                  onDragEnd={handleNodeDragEnd} />
              )
            })}
          </>
        )}
      </div>

      {/* FAB */}
      {companies.length > 0 && (
        <div className="fixed bottom-8 right-8 z-40">
          <button onClick={() => setShowModal(true)}
            className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 flex items-center justify-center transition-all hover:scale-110">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-[#2a2a2a] flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Nueva empresa</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={handleCreate} className="p-5 space-y-4">
                <div>
                  <label className="label">Nombre *</label>
                  <input className="input w-full" placeholder="Ej: ISM Consulting" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="label">Descripción corta</label>
                  <input className="input w-full" placeholder="¿De qué se trata?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <label className="label">Ícono</label>
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map((em) => (
                      <button key={em} type="button" onClick={() => setForm({ ...form, emoji: em })}
                        className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${form.emoji === em ? 'bg-blue-600/30 border border-blue-500 scale-110' : 'bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#444]'}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Color del nodo</label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map((c) => (
                      <button key={c.value} type="button" title={c.label} onClick={() => setForm({ ...form, color: c.value })}
                        className={`w-8 h-8 rounded-full transition-all ${form.color === c.value ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#111]' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c.value }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <div className="flex gap-2">
                    {STATUSES.map((s) => (
                      <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.status === s ? STATUS_COLORS[s] : 'border-[#2a2a2a] text-gray-500 hover:text-gray-300'}`}>
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Industria</label>
                  <select className="input w-full" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })}>
                    {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 flex-shrink-0"
                    style={{ borderColor: form.color, boxShadow: `0 0 12px ${form.color}40` }}>
                    {form.emoji}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{form.name || 'Nombre de empresa'}</p>
                    <p className="text-gray-500 text-xs">{form.industry}</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={saving || !form.name.trim()} className="btn-primary flex-1 disabled:opacity-50">
                    {saving ? 'Creando...' : 'Crear empresa'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ────────────────────── Center Node ────────────────────── */

function CenterNode({ x, y, containerRef, onDragEnd }: {
  x: number; y: number
  containerRef: React.RefObject<HTMLDivElement>
  onDragEnd: (newX: number, newY: number) => void
}) {
  const size = 110
  const motionX = useMotionValue(x - size / 2)
  const motionY = useMotionValue(y - size / 2)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => { motionX.set(x - size / 2); motionY.set(y - size / 2) }, [x, y])

  return (
    <motion.div
      drag dragConstraints={containerRef} dragMomentum={false} dragElastic={0.05}
      style={{ x: motionX, y: motionY, position: 'absolute', left: 0, top: 0, width: size, height: size, zIndex: 10 }}
      className={isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => { setIsDragging(false); onDragEnd(motionX.get() + size / 2, motionY.get() + size / 2) }}
    >
      <motion.div
        animate={isDragging ? { boxShadow: '0 0 40px #2563eb80' } : { boxShadow: ['0 0 0 0px #2563eb40', '0 0 0 14px #2563eb00'] }}
        transition={isDragging ? {} : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        className="w-full h-full rounded-full bg-[#0a1628] border-2 border-blue-600 flex flex-col items-center justify-center select-none"
      >
        <span className="text-2xl font-black text-blue-400">M</span>
        <span className="text-[8px] text-blue-400/60 font-bold tracking-widest">MARIN</span>
        <span className="text-[7px] text-blue-400/40 tracking-widest">SYSTEMS</span>
      </motion.div>
    </motion.div>
  )
}

/* ────────────────────── Company Node ────────────────────── */

function CompanyNode({ company, x, y, delay, pending, containerRef, onClick, onDragEnd }: {
  company: Company; x: number; y: number; delay: number; pending: number
  containerRef: React.RefObject<HTMLDivElement>
  onClick: () => void
  onDragEnd: (id: string, newX: number, newY: number) => void
}) {
  const size = 88
  const motionX = useMotionValue(x - size / 2)
  const motionY = useMotionValue(y - size / 2)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => { motionX.set(x - size / 2); motionY.set(y - size / 2) }, [x, y])

  return (
    <motion.div
      drag dragConstraints={containerRef} dragMomentum={false} dragElastic={0.05}
      style={{ x: motionX, y: motionY, position: 'absolute', left: 0, top: 0, width: size, height: size, zIndex: 10 }}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 16, stiffness: 200 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => { setIsDragging(false); onDragEnd(company.id, motionX.get() + size / 2, motionY.get() + size / 2) }}
    >
      <motion.div
        animate={isDragging ? {} : { y: [0, -5, 0] }}
        transition={{ duration: 3.5 + delay, repeat: Infinity, ease: 'easeInOut' }}
        className="w-full h-full"
      >
        <button
          onClick={(e) => { if (isDragging) { e.preventDefault(); return }; onClick() }}
          className={`w-full h-full rounded-full flex flex-col items-center justify-center relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            background: `${company.color}18`, border: `2px solid ${isDragging ? company.color : company.color + '60'}`,
            boxShadow: isDragging ? `0 0 32px ${company.color}80` : `0 0 16px ${company.color}30`,
            transition: 'box-shadow 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => { if (!isDragging) { e.currentTarget.style.boxShadow = `0 0 28px ${company.color}70`; e.currentTarget.style.borderColor = company.color } }}
          onMouseLeave={(e) => { if (!isDragging) { e.currentTarget.style.boxShadow = `0 0 16px ${company.color}30`; e.currentTarget.style.borderColor = `${company.color}60` } }}
        >
          <span className="text-2xl select-none">{company.emoji}</span>
          <span className="text-[9px] font-semibold mt-0.5 px-1 text-center leading-tight" style={{ color: company.color, maxWidth: 72 }}>
            {company.name.length > 13 ? company.name.slice(0, 11) + '…' : company.name}
          </span>
          <div className="absolute -bottom-1.5 w-3 h-3 rounded-full border-2 border-[#080808]" style={{ backgroundColor: company.color }} />
          {pending > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center">
              <span className="text-[9px] font-black text-black">{pending > 9 ? '9+' : pending}</span>
            </div>
          )}
        </button>
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[9px] px-2 py-0.5 rounded-full border font-medium"
            style={{ color: company.color, borderColor: `${company.color}50`, background: `${company.color}15` }}>
            {STATUS_LABELS[company.status] ?? company.status}
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ────────────────────── Canvas Note ────────────────────── */

function CanvasNoteEl({ note, containerRef, onUpdate, onDelete }: {
  note: CanvasNote
  containerRef: React.RefObject<HTMLDivElement>
  onUpdate: (id: string, updates: Partial<CanvasNote>) => void
  onDelete: (id: string) => void
}) {
  const motionX = useMotionValue(note.x)
  const motionY = useMotionValue(note.y)
  const [editing, setEditing] = useState(note.text === '')
  const [text, setText] = useState(note.text)
  const [isDragging, setIsDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  const color = NOTE_COLORS[note.colorIdx % NOTE_COLORS.length]

  useEffect(() => { motionX.set(note.x); motionY.set(note.y) }, [note.x, note.y])

  function saveText() {
    setEditing(false)
    onUpdate(note.id, { text, x: motionX.get(), y: motionY.get() })
  }

  return (
    <motion.div
      drag={!editing} dragConstraints={containerRef} dragMomentum={false} dragElastic={0.05}
      style={{ x: motionX, y: motionY, position: 'absolute', left: 0, top: 0, width: 168, zIndex: 5 }}
      className={editing ? 'cursor-text' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => { setIsDragging(false); onUpdate(note.id, { text, x: motionX.get(), y: motionY.get() }) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="rounded-xl border p-3 relative" style={{ background: color.bg, borderColor: color.border }}>
        <AnimatePresence>
          {(hovered || editing) && (
            <motion.button initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
              onClick={() => onDelete(note.id)}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-white text-xs z-10 hover:bg-red-500">
              ×
            </motion.button>
          )}
        </AnimatePresence>
        {editing ? (
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onBlur={saveText} onKeyDown={(e) => { if (e.key === 'Escape') saveText() }}
            className="w-full bg-transparent resize-none outline-none text-xs leading-relaxed"
            style={{ color: color.text, minHeight: 60 }} placeholder="Escribe aquí..." />
        ) : (
          <p onDoubleClick={() => setEditing(true)}
            className="text-xs leading-relaxed whitespace-pre-wrap select-none"
            style={{ color: color.text, minHeight: 40 }}>
            {text || <span style={{ opacity: 0.35 }}>Doble clic para editar</span>}
          </p>
        )}
        <div className="mt-2 flex gap-1.5 justify-center">
          {NOTE_COLORS.map((c, i) => (
            <button key={i} onClick={(e) => { e.stopPropagation(); onUpdate(note.id, { colorIdx: i }) }}
              className="w-3 h-3 rounded-full border transition-transform hover:scale-125"
              style={{ background: c.border, borderColor: i === note.colorIdx ? '#fff' : 'transparent', boxShadow: i === note.colorIdx ? `0 0 0 1px ${c.border}` : 'none' }} />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
