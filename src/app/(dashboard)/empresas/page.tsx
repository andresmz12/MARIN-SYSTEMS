'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

interface CompanyTask { id: string; status: string; priority: string }
interface Company {
  id: string; name: string; emoji: string; color: string
  status: string; industry: string | null; description: string | null
  tasks: CompanyTask[]
}

const EMOJIS = ['🏢', '📊', '🧾', '🧹', '📦', '🏠', '💼', '🚀', '🌎', '💰', '🛒', '📱', '🎯', '⚡', '🔧']
const COLORS = [
  { label: 'Azul', value: '#2563eb' },
  { label: 'Violeta', value: '#7c3aed' },
  { label: 'Verde', value: '#16a34a' },
  { label: 'Naranja', value: '#ea580c' },
  { label: 'Cyan', value: '#0891b2' },
  { label: 'Dorado', value: '#ca8a04' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Rosa', value: '#db2777' },
  { label: 'Teal', value: '#0d9488' },
  { label: 'Gris', value: '#6b7280' },
]
const INDUSTRIES = ['Consultoría', 'SaaS/Tech', 'Limpieza', 'Logística/Envíos', 'Inmobiliaria', 'E-commerce', 'Otro']
const STATUSES = ['activa', 'pausa', 'idea'] as const
const STATUS_LABELS: Record<string, string> = { activa: 'Activa', pausa: 'En pausa', idea: 'Idea' }
const STATUS_COLORS: Record<string, string> = {
  activa: 'bg-green-500/20 text-green-400 border-green-500/30',
  pausa: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  idea: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

function getNodePos(index: number, total: number, cx: number, cy: number, radius: number) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
}

export default function EmpresasPage() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [dims, setDims] = useState({ w: 800, h: 580 })
  const [form, setForm] = useState({ name: '', description: '', emoji: '🏢', color: '#2563eb', status: 'activa', industry: 'Consultoría' })
  const [saving, setSaving] = useState(false)

  const updateDims = useCallback(() => {
    if (containerRef.current) {
      setDims({ w: containerRef.current.offsetWidth || 800, h: 580 })
    }
  }, [])

  useEffect(() => {
    loadCompanies()
    const onResize = () => {
      setIsMobile(window.innerWidth < 768)
      updateDims()
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [updateDims])

  useEffect(() => {
    updateDims()
  }, [companies, updateDims])

  async function loadCompanies() {
    setLoading(true)
    try {
      const res = await fetch('/api/companies')
      if (res.ok) setCompanies(await res.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const company: Company = await res.json()
        setCompanies((prev) => [...prev, company])
        setShowModal(false)
        setForm({ name: '', description: '', emoji: '🏢', color: '#2563eb', status: 'activa', industry: 'Consultoría' })
      }
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const activeCount = companies.filter((c) => c.status === 'activa').length
  const cx = dims.w / 2
  const cy = dims.h / 2
  const radius = Math.min(cx - 80, cy - 80, 220)

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🗺️ Empresas</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {companies.length} empresa{companies.length !== 1 ? 's' : ''} · {activeCount} activa{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva empresa
        </button>
      </div>

      {/* Canvas */}
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
          /* Mobile grid */
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
          /* Desktop map */
          <>
            {/* SVG lines */}
            <svg width={dims.w} height={dims.h} className="absolute inset-0 pointer-events-none">
              <defs>
                <radialGradient id="cglow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx={cx} cy={cy} r={120} fill="url(#cglow)" />
              {companies.map((company, i) => {
                const pos = getNodePos(i, companies.length, cx, cy, radius)
                return (
                  <line key={company.id} x1={cx} y1={cy} x2={pos.x} y2={pos.y}
                    stroke={company.color} strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="6 4" />
                )
              })}
            </svg>

            {/* Center node */}
            <div className="absolute flex items-center justify-center" style={{ left: cx - 55, top: cy - 55, width: 110, height: 110 }}>
              <motion.div
                animate={{ boxShadow: ['0 0 0 0px #2563eb40', '0 0 0 14px #2563eb00'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="w-full h-full rounded-full bg-[#0a1628] border-2 border-blue-600 flex flex-col items-center justify-center"
              >
                <span className="text-2xl font-black text-blue-400">M</span>
                <span className="text-[8px] text-blue-400/60 font-bold tracking-widest">MARIN</span>
                <span className="text-[7px] text-blue-400/40 tracking-widest">SYSTEMS</span>
              </motion.div>
            </div>

            {/* Company nodes */}
            {companies.map((company, i) => {
              const pos = getNodePos(i, companies.length, cx, cy, radius)
              const pending = company.tasks.filter((t) => t.status !== 'completada').length
              return (
                <CompanyNode key={company.id} company={company} x={pos.x} y={pos.y}
                  delay={i * 0.1} pending={pending} onClick={() => router.push(`/empresas/${company.id}`)} />
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
                {/* Preview */}
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

/* ────────────────────── Company Node ────────────────────── */

function CompanyNode({ company, x, y, delay, pending, onClick }: {
  company: Company; x: number; y: number; delay: number; pending: number; onClick: () => void
}) {
  const size = 88
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', damping: 16, stiffness: 200 }}
      style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }}
    >
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3.5 + delay, repeat: Infinity, ease: 'easeInOut' }}
        className="w-full h-full"
      >
        <button
          onClick={onClick}
          className="w-full h-full rounded-full flex flex-col items-center justify-center relative"
          style={{
            background: `${company.color}18`,
            border: `2px solid ${company.color}60`,
            boxShadow: `0 0 16px ${company.color}30`,
            transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 0 28px ${company.color}70`
            e.currentTarget.style.borderColor = company.color
            e.currentTarget.style.transform = 'scale(1.08)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = `0 0 16px ${company.color}30`
            e.currentTarget.style.borderColor = `${company.color}60`
            e.currentTarget.style.transform = 'scale(1)'
          }}
        >
          <span className="text-2xl select-none">{company.emoji}</span>
          <span className="text-[9px] font-semibold mt-0.5 px-1 text-center leading-tight"
            style={{ color: company.color, maxWidth: 72 }}>
            {company.name.length > 13 ? company.name.slice(0, 11) + '…' : company.name}
          </span>
          {/* Connection dot */}
          <div className="absolute -bottom-1.5 w-3 h-3 rounded-full border-2 border-[#080808]" style={{ backgroundColor: company.color }} />
          {/* Badge */}
          {pending > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center">
              <span className="text-[9px] font-black text-black">{pending > 9 ? '9+' : pending}</span>
            </div>
          )}
        </button>
        {/* Status label */}
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
