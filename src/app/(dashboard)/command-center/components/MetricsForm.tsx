'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { GeneratedPost } from '../types'

const FIELDS = [
  ['reach', 'Alcance'],
  ['likes', 'Likes'],
  ['comments', 'Comentarios'],
  ['shares', 'Compartidos'],
  ['saves', 'Guardados'],
  ['clicks', 'Clics'],
] as const
type Key = (typeof FIELDS)[number][0]

// Números de un post publicado. Se llenan solos desde Make (Facebook/Instagram) o a mano
// (TikTok, LinkedIn, X). Alimentan al analista de métricas.
export function MetricsForm({ post, onSaved }: { post: GeneratedPost; onSaved: () => void }) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [vals, setVals] = useState<Record<Key, string>>(() => {
    const m = post.metric
    return Object.fromEntries(FIELDS.map(([k]) => [k, m?.[k] != null ? String(m[k]) : ''])) as Record<Key, string>
  })

  async function save() {
    const body = Object.fromEntries(FIELDS.map(([k]) => [k, vals[k].trim() === '' ? null : Number(vals[k])]))
    if (Object.values(body).some((v) => v !== null && (!Number.isInteger(v) || (v as number) < 0))) {
      showToast('Usa solo números enteros', 'error')
      return
    }
    const res = await fetch(`/api/ceo/content/${post.id}/metrics`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { showToast('Números guardados', 'success'); setOpen(false); onSaved() }
    else showToast('No se pudieron guardar', 'error')
  }

  const has = !!post.metric
  return (
    <div className="w-full">
      <button onClick={() => setOpen(!open)} className="text-[11px] text-zinc-400 hover:text-zinc-200">
        📊 {has ? `Números: ${post.metric?.likes ?? '–'} likes · ${post.metric?.reach ?? '–'} alcance${post.metric?.source === 'make' ? ' (auto)' : ''}` : 'Agregar números'}
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          {FIELDS.map(([k, label]) => (
            <label key={k} className="text-[11px] text-zinc-400">
              {label}
              <input
                type="number"
                min={0}
                value={vals[k]}
                onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                className="block w-20 bg-zinc-800 border border-zinc-700 rounded-md px-1.5 py-1 text-xs text-zinc-100"
              />
            </label>
          ))}
          <button onClick={save} className="text-xs text-emerald-300 border border-emerald-500/40 rounded-md px-2.5 py-1 hover:bg-emerald-500/10">Guardar</button>
        </div>
      )}
    </div>
  )
}
