'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Load StudioMap client-only (uses ResizeObserver)
const StudioMap = dynamic(() => import('@/components/studio/StudioMap'), { ssr: false })

interface MapaJson {
  centro: { id: string; emoji?: string; texto: string; color: string }
  ramas: Array<{
    id: string; emoji?: string; texto: string; color: string
    hijos: Array<{ id: string; texto: string; color: string }>
  }>
}

type PageState = 'loading' | 'expired' | 'ready'

export default function StudioPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [state, setState] = useState<PageState>('loading')
  const [mapa, setMapa] = useState<MapaJson | null>(null)
  const [hasAudio, setHasAudio] = useState(false)

  useEffect(() => {
    fetch(`/api/studio/${token}`)
      .then(res => {
        if (res.status === 410 || res.status === 404) { setState('expired'); return null }
        if (!res.ok) { setState('expired'); return null }
        return res.json()
      })
      .then(data => {
        if (!data) return
        setMapa(data.mapaJson as MapaJson)
        setHasAudio(!!data.audioPath)
        setState('ready')
      })
      .catch(() => setState('expired'))
  }, [token])

  async function handleDescargar() {
    const res = await fetch(`/api/studio/${token}/audio`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `video-audio-${token}.mp3`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (state === 'loading') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafaf8' }}>
        <svg style={{ width: 40, height: 40, color: '#60a5fa' }} fill="none" viewBox="0 0 24 24">
          <style>{`@keyframes sm-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } } .sm-spin { animation: sm-spin 1s linear infinite }`}</style>
          <circle className="sm-spin" style={{ opacity: 0.25, transformOrigin: 'center' }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (state === 'expired') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafaf8' }}>
        <div style={{ textAlign: 'center', padding: 32, maxWidth: 320 }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>⏱</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Link expirado</h2>
          <p style={{ fontSize: 14, color: '#64748b' }}>Genera uno nuevo en Marine System.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#fafaf8', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'radial-gradient(circle, #ccc 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        opacity: 0.3,
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
        {mapa && <StudioMap mapa={mapa} />}
      </div>

      {hasAudio && (
        <button
          onClick={handleDescargar}
          style={{
            position: 'fixed', bottom: 108, right: 24,
            width: 56, height: 56, borderRadius: '50%',
            border: 'none', background: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            fontSize: 22, cursor: 'pointer', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Descargar MP3"
        >
          ⬇️
        </button>
      )}
    </div>
  )
}
