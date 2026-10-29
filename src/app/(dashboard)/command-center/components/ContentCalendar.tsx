'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CEOCompany } from '../types'

interface CalItem {
  id: string
  topic: string
  source: string
  sourceUrl: string | null
  status: string
  time: string
  carousel: number
  hasImage: boolean
  platforms: { platform: string; status: string; url: string | null }[]
}
type Days = Record<string, CalItem[]>

const STATUS: Record<string, { label: string; dot: string; chip: string }> = {
  published: { label: 'Publicado', dot: 'bg-emerald-400', chip: 'border-emerald-500/40 text-emerald-300' },
  approved: { label: 'Programado', dot: 'bg-sky-400', chip: 'border-sky-500/40 text-sky-300' },
  ready: { label: 'Programado', dot: 'bg-sky-400', chip: 'border-sky-500/40 text-sky-300' },
  publishing: { label: 'Publicando', dot: 'bg-sky-400', chip: 'border-sky-500/40 text-sky-300' },
  pending_review: { label: 'Por aprobar', dot: 'bg-amber-400', chip: 'border-amber-500/40 text-amber-300' },
  draft: { label: 'Borrador', dot: 'bg-zinc-500', chip: 'border-zinc-600 text-zinc-400' },
  failed: { label: 'Falló', dot: 'bg-red-400', chip: 'border-red-500/40 text-red-300' },
  rejected: { label: 'Rechazado', dot: 'bg-zinc-600', chip: 'border-zinc-700 text-zinc-500' },
}
const NETWORK: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', twitter: 'X', tiktok: 'TikTok' }
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEK = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const pad = (n: number) => String(n).padStart(2, '0')
const monthKey = (y: number, m: number) => `${y}-${pad(m + 1)}`

function colombiaToday(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function ContentCalendar({ companies }: { companies: CEOCompany[] }) {
  const today = colombiaToday()
  const [y0, m0] = today.split('-').map(Number)
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [cursor, setCursor] = useState({ y: y0, m: m0 - 1 })
  const [days, setDays] = useState<Days>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>(today)
  const [showRejected, setShowRejected] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ceo/calendar?companyId=${companyId}&month=${monthKey(cursor.y, cursor.m)}`)
      if (!res.ok) throw new Error()
      setDays(((await res.json()) as { days: Days }).days)
    } catch {
      setError('No se pudo cargar el calendario')
    }
    setLoading(false)
  }, [companyId, cursor])

  useEffect(() => { load() }, [load])

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1))
    const lead = (first.getUTCDay() + 6) % 7 // lunes primero
    const count = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate()
    return [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[]
  }, [cursor])

  const visible = (d: string) => (days[d] ?? []).filter((i) => showRejected || i.status !== 'rejected')
  const all = Object.values(days).flat().filter((i) => showRejected || i.status !== 'rejected')
  const count = (s: string[]) => all.filter((i) => s.includes(i.status)).length
  const sel = visible(selected).sort((a, b) => a.time.localeCompare(b.time))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button aria-label="Mes anterior" onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))} className="px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500">‹</button>
          <span className="w-40 text-center text-sm font-semibold capitalize text-white">{MONTHS[cursor.m]} {cursor.y}</span>
          <button aria-label="Mes siguiente" onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))} className="px-2.5 py-1 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500">›</button>
        </div>
        <button onClick={() => { setCursor({ y: y0, m: m0 - 1 }); setSelected(today) }} className="text-xs text-zinc-300 border border-zinc-700 rounded-lg px-2.5 py-1.5 hover:border-zinc-500">Hoy</button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> mostrar rechazados
        </label>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
        <span><b className="text-emerald-300">{count(['published'])}</b> publicados</span>
        <span><b className="text-sky-300">{count(['approved', 'ready', 'publishing'])}</b> programados</span>
        <span><b className="text-amber-300">{count(['pending_review', 'draft'])}</b> por aprobar</span>
        {count(['failed']) > 0 && <span><b className="text-red-300">{count(['failed'])}</b> con error</span>}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className={`grid grid-cols-7 gap-1 ${loading ? 'opacity-60' : ''}`}>
        {WEEK.map((w) => <div key={w} className="py-1 text-center text-[11px] font-semibold text-zinc-500">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const key = `${monthKey(cursor.y, cursor.m)}-${pad(d)}`
          const items = visible(key)
          const on = key === selected
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`min-h-[72px] rounded-lg border p-1 text-left align-top transition-colors ${on ? 'border-indigo-400 bg-indigo-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'} ${key === today ? 'ring-1 ring-amber-400/60' : ''}`}
            >
              <span className={`text-[11px] ${key === today ? 'font-bold text-amber-300' : 'text-zinc-400'}`}>{d}</span>
              <div className="mt-0.5 space-y-0.5">
                {items.slice(0, 3).map((it) => (
                  <div key={it.id} className="flex items-center gap-1 truncate text-[10px] leading-tight text-zinc-300">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS[it.status]?.dot ?? 'bg-zinc-500'}`} />
                    <span className="truncate">{it.topic}</span>
                  </div>
                ))}
                {items.length > 3 && <div className="text-[10px] text-zinc-500">+{items.length - 3} más</div>}
              </div>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <h3 className="text-sm font-bold text-white">{selected.split('-').reverse().join('/')}</h3>
        {sel.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">Nada programado ni publicado este día.</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {sel.map((it) => {
              const st = STATUS[it.status] ?? STATUS.draft
              return (
                <li key={it.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${st.chip}`}>{st.label}</span>
                    <span className="text-[11px] text-zinc-500">{it.time}{it.source === 'news' ? ' · 📰 noticia' : ''}{it.carousel ? ` · 🎠 ${it.carousel} láminas` : ''}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-100">{it.topic}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {it.platforms.map((p) => {
                      const label = NETWORK[p.platform] ?? p.platform
                      const cls = `rounded-full border px-2 py-0.5 text-[11px] ${(STATUS[p.status] ?? STATUS.draft).chip}`
                      return p.url
                        ? <a key={p.platform} href={p.url} target="_blank" rel="noreferrer" className={`${cls} underline`}>{label} ↗</a>
                        : <span key={p.platform} className={cls}>{label}</span>
                    })}
                    {it.sourceUrl && <a href={it.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 underline">Fuente ↗</a>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
