'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany } from '../types'
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

          {/* Brand profile button */}
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <button
              onClick={() => setBrandCompany(c)}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 hover:border-zinc-600 transition-colors"
            >
              🎯 Configurar marca
            </button>
          </div>
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
