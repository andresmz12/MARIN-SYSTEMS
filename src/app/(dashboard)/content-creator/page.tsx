'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'

const SOCIAL_OPTIONS = ['TikTok', 'Instagram', 'Facebook', 'YouTube'] as const
const DURATION_OPTIONS = ['30s', '45s', '60s'] as const
const LOADING_MSGS = ['Generando mapa...', 'Creando contenido con IA...', 'Preparando tu Studio...']

type SocialOption = typeof SOCIAL_OPTIONS[number]
type DurationOption = typeof DURATION_OPTIONS[number]
type PageState = 'form' | 'loading' | 'done'

export default function ContentCreatorPage() {
  const { toast } = useToast()
  const [pageState, setPageState] = useState<PageState>('form')
  const [tema, setTema] = useState('')
  const [redSocial, setRedSocial] = useState<SocialOption>('TikTok')
  const [duracion, setDuracion] = useState<DurationOption>('60s')
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [studioUrl, setStudioUrl] = useState('')
  const [guion, setGuion] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (pageState !== 'loading') return
    const id = setInterval(() => setLoadingMsgIdx(i => (i + 1) % LOADING_MSGS.length), 3000)
    return () => clearInterval(id)
  }, [pageState])

  async function handleGenerate() {
    if (!tema.trim()) return
    setPageState('loading')
    setLoadingMsgIdx(0)
    try {
      const res = await fetch('/api/content-creator/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: tema.trim(), redSocial, duracion }),
      })
      const data = await res.json() as { url?: string; guionCompleto?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? `Error al generar contenido (${res.status})`)
        setPageState('form')
        return
      }
      setStudioUrl(data.url)
      setGuion(data.guionCompleto ?? '')
      setPageState('done')
    } catch {
      toast.error('Error de conexión. Verifica tu internet e intenta de nuevo.')
      setPageState('form')
    }
  }

  function handleCopyGuion() {
    navigator.clipboard.writeText(guion).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleReset() {
    setPageState('form')
    setTema('')
    setStudioUrl('')
    setGuion('')
    setCopied(false)
  }

  return (
    <div className="flex flex-col items-center justify-start px-4 py-10 min-h-full">
      <div className="w-full max-w-xl">

        <div className="flex items-center gap-2 mb-8">
          <span className="text-2xl">🎬</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Content Creator</h1>
        </div>

        {/* FORM STATE */}
        {pageState === 'form' && (
          <div className="space-y-6">
            <div>
              <label className="label">¿Sobre qué es el video?</label>
              <textarea
                value={tema}
                onChange={e => setTema(e.target.value)}
                placeholder="Ej: Cómo abrir una LLC siendo indocumentado"
                className="input resize-none text-sm mt-1"
                rows={3}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
              />
            </div>

            <div>
              <label className="label">Red social</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {SOCIAL_OPTIONS.map(s => (
                  <button key={s} onClick={() => setRedSocial(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      redSocial === s
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                        : 'border-[var(--bg-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Duración objetivo</label>
              <div className="flex gap-2 mt-1">
                {DURATION_OPTIONS.map(d => (
                  <button key={d} onClick={() => setDuracion(d)}
                    className={`flex-1 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      duracion === d
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                        : 'border-[var(--bg-border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >{d}</button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!tema.trim()}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm disabled:opacity-50"
            >
              ✨ Generar Video
            </button>
          </div>
        )}

        {/* LOADING STATE */}
        {pageState === 'loading' && (
          <div className="flex flex-col items-center justify-center gap-6 py-16">
            <svg className="w-10 h-10 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-[var(--text-secondary)] font-medium">
              {LOADING_MSGS[loadingMsgIdx]}
            </p>
          </div>
        )}

        {/* DONE STATE */}
        {pageState === 'done' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-green-500 font-semibold">
              <span className="text-xl">✅</span>
              <span>¡Listo para grabar!</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label">Guion</label>
                <button onClick={handleCopyGuion} className="btn-secondary text-xs px-2.5 py-1">
                  {copied ? '✅ Copiado' : '📋 Copiar Guion'}
                </button>
              </div>
              <textarea
                readOnly
                value={guion}
                className="input resize-none text-xs leading-relaxed"
                rows={10}
              />
            </div>

            <div className="rounded-xl border border-[var(--bg-border)] bg-[var(--bg-sidebar)] p-4 space-y-3">
              <p className="text-xs text-[var(--text-secondary)] font-medium">Link del Studio</p>
              <p className="text-xs text-blue-400 break-all font-mono">{studioUrl}</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => { navigator.clipboard.writeText(studioUrl) }}
                  className="btn-secondary text-xs px-3 py-1.5"
                >
                  📋 Copiar Link
                </button>
                <button
                  onClick={() => window.open(studioUrl, '_blank')}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                >
                  📱 Abrir en iPad
                </button>
              </div>
              <p className="text-xs text-amber-500">⏱ Expira en 24 horas</p>
            </div>

            <button onClick={handleReset} className="btn-secondary w-full text-sm py-2.5">
              + Crear otro video
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
