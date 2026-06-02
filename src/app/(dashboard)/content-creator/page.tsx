'use client'

import { useState } from 'react'

type PageState = 'form' | 'loading' | 'done'

const REDES = ['TikTok', 'Instagram', 'YouTube', 'Facebook', 'LinkedIn']
const DURACIONES = ['30s', '60s', '90s', '120s']

export default function ContentCreatorPage() {
  const [tema, setTema] = useState('')
  const [redSocial, setRedSocial] = useState('TikTok')
  const [duracion, setDuracion] = useState('60s')
  const [pageState, setPageState] = useState<PageState>('form')
  const [studioUrl, setStudioUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function generate() {
    if (!tema.trim()) return
    setPageState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/content-creator/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: tema.trim(), redSocial, duracion }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setStudioUrl(body.url)
      setPageState('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error desconocido')
      setPageState('form')
    }
  }

  function copy() {
    navigator.clipboard.writeText(studioUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  /* ── Loading ── */
  if (pageState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-6" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <svg className="w-12 h-12 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <div className="text-center">
          <p className="text-[var(--text-primary)] font-semibold text-lg">Generando mapa + audio…</p>
          <p className="text-[var(--text-muted)] text-sm mt-1">Esto puede tomar hasta 30 segundos</p>
        </div>
      </div>
    )
  }

  /* ── Done ── */
  if (pageState === 'done') {
    return (
      <div className="flex flex-col items-center justify-center gap-8 px-4" style={{ minHeight: 'calc(100vh - 80px)' }}>
        <div className="text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">¡Tu estudio está listo!</h2>
          <p className="text-[var(--text-muted)] text-sm mt-1">Abre este enlace en tu iPad para ver el mapa y escuchar el audio</p>
        </div>

        <div className="card w-full max-w-lg p-4 flex items-center gap-3">
          <input
            readOnly
            value={studioUrl}
            className="input flex-1 text-xs font-mono"
          />
          <button onClick={copy} className="btn-primary text-sm whitespace-nowrap flex items-center gap-1.5">
            {copied ? '✅ Copiado' : '📋 Copiar'}
          </button>
        </div>

        <a
          href={studioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm flex items-center gap-2"
        >
          <span>🔗</span> Abrir en nueva pestaña
        </a>

        <button
          onClick={() => { setPageState('form'); setStudioUrl('') }}
          className="text-[var(--text-muted)] text-sm hover:text-[var(--text-primary)] transition-colors"
        >
          ← Crear otro
        </button>
      </div>
    )
  }

  /* ── Form ── */
  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🎯</span>
        <div>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">Content Creator</h1>
          <p className="text-xs text-[var(--text-muted)]">Genera un mapa educativo + audio para cualquier tema</p>
        </div>
      </div>

      {errorMsg && (
        <div className="card border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-red-400 text-sm">⚠️ {errorMsg}</p>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Tema del video</label>
          <textarea
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            placeholder="Ej: Cómo declarar impuestos por primera vez en EE.UU."
            rows={3}
            className="input resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Red social</label>
            <select
              value={redSocial}
              onChange={(e) => setRedSocial(e.target.value)}
              className="input"
            >
              {REDES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Duración</label>
            <select
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="input"
            >
              {DURACIONES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={!tema.trim()}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
        >
          <span>⚡</span>
          Generar mapa + audio
        </button>
      </div>
    </div>
  )
}
