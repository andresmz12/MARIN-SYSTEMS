'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'

const MapEditor = dynamic(() => import('@/components/studio/MapEditor'), { ssr: false })

interface SessionItem {
  token: string
  tema: string
  redSocial: string
  duracion: string
  isEdited: boolean
  createdAt: string
  expiresAt: string
  mapaJson: any
  guion: string
}

const SOCIAL_FILTERS = ['Todos', 'TikTok', 'Instagram', 'Facebook', 'YouTube']

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60)  return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d > 1 ? 's' : ''}`
}

function isExpired(iso: string): boolean { return new Date(iso) < new Date() }

export default function MisMopas() {
  const [sessions,     setSessions]     = useState<SessionItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [redFilter,    setRedFilter]    = useState('Todos')
  const [editToken,    setEditToken]    = useState<string | null>(null)
  const [copiedToken,  setCopiedToken]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search)                        params.set('tema', search)
    if (redFilter !== 'Todos')         params.set('redSocial', redFilter)
    const res = await fetch(`/api/studio/historial?${params}`)
    if (res.ok) setSessions(await res.json())
    setLoading(false)
  }, [search, redFilter])

  useEffect(() => { load() }, [load])

  function handleCopyLink(token: string) {
    const base = window.location.origin
    navigator.clipboard.writeText(`${base}/studio/${token}`).then(() => {
      setCopiedToken(token); setTimeout(() => setCopiedToken(null), 2000)
    })
  }

  function handleSaved(token: string, newMapa: any, newGuion: string) {
    setSessions(ss => ss.map(s => s.token === token ? { ...s, mapaJson: newMapa, guion: newGuion, isEdited: true } : s))
    setEditToken(null)
  }

  return (
    <div className="flex flex-col px-4 py-10 min-h-full">
      <div className="w-full max-w-2xl mx-auto">

        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl">📋</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Mis Mapas</h1>
          <span className="text-xs text-[var(--text-secondary)] ml-2">({sessions.length})</span>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <input
            type="text" placeholder="Buscar por tema…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="input text-sm flex-1 min-w-[160px]"
          />
          <div className="flex gap-1 flex-wrap">
            {SOCIAL_FILTERS.map(f => (
              <button key={f} onClick={() => setRedFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  redFilter === f
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                    : 'border-[var(--bg-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="w-8 h-8 animate-spin text-cyan-300" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-secondary)] text-sm">
            No hay mapas guardados todavía.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => {
              const expired = isExpired(s.expiresAt)
              const editing = editToken === s.token
              const studioUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/studio/${s.token}`

              return (
                <div key={s.token} className="rounded-xl border border-[var(--bg-border)] bg-[var(--bg-card)] overflow-hidden">
                  {/* Card header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          📋 {s.tema}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {s.redSocial} · {s.duracion} · {timeAgo(s.createdAt)}
                          {s.isEdited && <span className="ml-2 text-amber-500">✏️ editado</span>}
                          {expired && <span className="ml-2 text-red-400">⏱ expirado</span>}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                      {!expired ? (
                        <button
                          onClick={() => window.open(studioUrl, '_blank')}
                          className="btn-primary flex-1 py-2 text-xs flex items-center justify-center gap-1.5">
                          📱 Abrir Studio
                        </button>
                      ) : (
                        <span className="flex-1 text-center py-2 text-xs text-red-400 border border-red-400/30 rounded-lg">
                          Link expirado
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyLink(s.token)}
                        className="btn-secondary px-3 py-2 text-xs">
                        {copiedToken === s.token ? '✅' : '📋'}
                      </button>
                      <button
                        onClick={() => setEditToken(editing ? null : s.token)}
                        className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                          editing
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                            : 'btn-secondary'
                        }`}>
                        ✏️ Editar
                      </button>
                    </div>
                  </div>

                  {/* Inline editor */}
                  {editing && (
                    <div className="border-t border-[var(--bg-border)] p-4 bg-[var(--bg-sidebar)]">
                      <MapEditor
                        mapaJson={s.mapaJson}
                        guion={s.guion}
                        token={s.token}
                        onSaved={(m, g) => handleSaved(s.token, m, g)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
