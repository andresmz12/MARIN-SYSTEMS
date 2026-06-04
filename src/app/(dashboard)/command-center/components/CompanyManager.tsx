'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, CompanyRevenue } from '../types'
import { CEO_COLORS, flag } from '../utils'
import { BrandProfileModal } from './BrandProfileModal'

interface Props {
  companies: CEOCompany[]
  onChanged?: () => void
}

type Patch = Partial<Pick<CEOCompany, 'name' | 'color' | 'emoji' | 'strategicWeight' | 'isActive'>>

export function CompanyManager({ companies, onChanged }: Props) {
  const { showToast } = useToast()
  const [list, setList] = useState<CEOCompany[]>(companies)
  const [showModal, setShowModal] = useState(false)
  const [brandCompany, setBrandCompany] = useState<CEOCompany | null>(null)
  const [revenueCompany, setRevenueCompany] = useState<CEOCompany | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => { setList(companies) }, [companies])

  function scheduleSave(id: string, patch: Patch) {
    if (timers.current[id]) clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ceo/companies/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) throw new Error()
        onChanged?.()
      } catch {
        showToast('Error al guardar cambios', 'error')
      }
    }, 800)
  }

  function update(id: string, patch: Patch) {
    setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    scheduleSave(id, patch)
  }

  return (
    <div className="space-y-3">
      {list.map((c) => (
        <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <ColorDot color={c.color} onPick={(color) => update(c.id, { color })} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{c.emoji} {c.name}</p>
                <p className="text-[11px] text-zinc-500">
                  {c.country.length ? c.country.map(flag).join(' ') : 'Sin país'}
                </p>
              </div>
            </div>

            {/* Active toggle */}
            <button
              onClick={() => update(c.id, { isActive: !c.isActive })}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${c.isActive ? 'bg-green-500/70' : 'bg-zinc-700'}`}
              title={c.isActive ? 'Activa' : 'Inactiva'}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${c.isActive ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Strategic weight slider */}
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-zinc-500 whitespace-nowrap">Peso estratégico</span>
            <input
              type="range" min={1} max={5} step={1} value={c.strategicWeight}
              onChange={(e) => update(c.id, { strategicWeight: Number(e.target.value) })}
              className="flex-1 accent-indigo-500"
            />
            <span className="text-sm font-bold text-white w-4 text-center">{c.strategicWeight}</span>
          </div>

          {/* Brand profile + Revenue buttons */}
          <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
            <button
              onClick={() => setBrandCompany(c)}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              🎯 Configurar marca
            </button>
            <button
              onClick={() => setRevenueCompany((prev) => (prev?.id === c.id ? null : c))}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                revenueCompany?.id === c.id
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              💰 Ingresos
            </button>
          </div>

          {/* Revenue tracker panel */}
          <AnimatePresence>
            {revenueCompany?.id === c.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  <RevenueTracker company={c} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      <button
        onClick={() => setShowModal(true)}
        className="w-full py-3 rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
      >
        + Agregar empresa
      </button>

      <AnimatePresence>
        {showModal && (
          <NewCompanyModal
            onClose={() => setShowModal(false)}
            onCreated={() => { setShowModal(false); onChanged?.() }}
          />
        )}
        {brandCompany && (
          <BrandProfileModal company={brandCompany} onClose={() => setBrandCompany(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function ColorDot({ color, onPick }: { color: string; onPick: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full border-2 border-zinc-700"
        style={{ backgroundColor: color }}
        title="Cambiar color"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-10 left-0 z-20 grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-zinc-800 border border-zinc-700 shadow-xl">
            {CEO_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { onPick(c); setOpen(false) }}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${c === color ? 'ring-2 ring-white' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function currentYearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function RevenueTracker({ company }: { company: CEOCompany }) {
  const { showToast } = useToast()
  const year = String(new Date().getFullYear())
  const [rows, setRows] = useState<CompanyRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState('')
  const [editActual, setEditActual] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/ceo/companies/${company.id}/revenue?year=${year}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: CompanyRevenue[]) => setRows(data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [company.id, year])

  function getRow(month: string): CompanyRevenue | undefined {
    return rows.find((r) => r.month === month)
  }

  function startEdit(month: string) {
    const row = getRow(month)
    setEditing(month)
    setEditTarget(row ? String(row.target) : '0')
    setEditActual(row ? String(row.actual) : '0')
  }

  async function saveEdit(month: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/ceo/companies/${company.id}/revenue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          target: Number(editTarget) || 0,
          actual: Number(editActual) || 0,
        }),
      })
      if (!res.ok) throw new Error()
      const updated: CompanyRevenue = await res.json()
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.month === month)
        return idx >= 0 ? prev.map((r) => (r.month === month ? updated : r)) : [...prev, updated]
      })
      showToast('Ingresos guardados', 'success')
    } catch {
      showToast('Error al guardar', 'error')
    }
    setSaving(false)
    setEditing(null)
  }

  const totalTarget = rows.reduce((s, r) => s + r.target, 0)
  const totalActual = rows.reduce((s, r) => s + r.actual, 0)
  const currency = rows[0]?.currency ?? 'USD'

  function fmt(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  }

  if (loading) return <div className="h-10 rounded-lg bg-zinc-800/50 animate-pulse" />

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-zinc-300">Ingresos {year}</h4>
        <div className="flex gap-3 text-xs">
          <span className="text-zinc-500">Meta: <span className="text-white font-medium">{fmt(totalTarget)}</span></span>
          <span className="text-zinc-500">Real: <span className={totalActual >= totalTarget ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'}>{fmt(totalActual)}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => {
          const month = `${year}-${String(i + 1).padStart(2, '0')}`
          const row = getRow(month)
          const isEditing = editing === month
          const isCurrent = month === currentYearMonth()
          const pct = row && row.target > 0 ? Math.min(100, (row.actual / row.target) * 100) : 0
          const achieved = row && row.actual >= row.target && row.target > 0

          return (
            <div
              key={month}
              className={`rounded-lg p-2 border transition-colors cursor-pointer ${
                isCurrent ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
              }`}
              onClick={() => !isEditing && startEdit(month)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-zinc-300">{MONTHS_ES[i]}</span>
                {achieved && <span className="text-[10px] text-emerald-400">✓</span>}
              </div>

              {isEditing ? (
                <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number" min={0} value={editTarget} onChange={(e) => setEditTarget(e.target.value)}
                    placeholder="Meta" autoFocus
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="number" min={0} value={editActual} onChange={(e) => setEditActual(e.target.value)}
                    placeholder="Real"
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => saveEdit(month)}
                      disabled={saving}
                      className="flex-1 text-[10px] py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors"
                    >
                      {saving ? '…' : '✓'}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex-1 text-[10px] py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : row ? (
                <>
                  <p className="text-[10px] text-zinc-500">Meta: {fmt(row.target)}</p>
                  <p className={`text-[10px] font-medium ${achieved ? 'text-emerald-400' : 'text-zinc-300'}`}>
                    Real: {fmt(row.actual)}
                  </p>
                  {row.target > 0 && (
                    <div className="mt-1.5 h-1 rounded-full bg-zinc-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${achieved ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-zinc-600 mt-1">Click para agregar</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏢')
  const [color, setColor] = useState(CEO_COLORS[0])
  const [strategicWeight, setStrategicWeight] = useState(3)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/ceo/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, emoji, color, strategicWeight }),
      })
      if (!res.ok) throw new Error()
      showToast('Empresa creada', 'success')
      onCreated()
    } catch {
      showToast('Error al crear empresa', 'error')
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
          <h2 className="text-lg font-bold text-white">Nueva empresa</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="text-xs font-medium text-zinc-400 block mb-1">Emoji</label>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4}
                className="w-full bg-zinc-800 border border-zinc-700 text-center text-xl rounded-lg px-2 py-2 focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-400 block mb-1">Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus
                placeholder="Nombre de la empresa"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1.5">Color</label>
            <div className="flex flex-wrap gap-2">
              {CEO_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${c === color ? 'ring-2 ring-white' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-400 block mb-1">Peso estratégico: {strategicWeight}</label>
            <input type="range" min={1} max={5} step={1} value={strategicWeight}
              onChange={(e) => setStrategicWeight(Number(e.target.value))} className="w-full accent-indigo-500" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Cancelar</button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40">
              {saving ? 'Guardando…' : 'Crear'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
