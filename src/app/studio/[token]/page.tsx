'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Force full-screen on iPad Safari (injected at runtime since this is a client page)
const STUDIO_STYLE = `
  html, body { margin:0; padding:0; overflow:hidden; width:100%; height:100%; }
`

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

  // Inject fullscreen styles + meta for iPad Safari
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = STUDIO_STYLE
    document.head.appendChild(style)

    const metas: HTMLMetaElement[] = []
    const addMeta = (name: string, content: string) => {
      if (!document.querySelector(`meta[name="${name}"]`)) {
        const m = document.createElement('meta')
        m.name = name; m.content = content
        document.head.appendChild(m); metas.push(m)
      }
    }
    addMeta('apple-mobile-web-app-capable', 'yes')
    addMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
    addMeta('mobile-web-app-capable', 'yes')

    return () => {
      document.head.removeChild(style)
      metas.forEach(m => document.head.removeChild(m))
    }
  }, [])

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
        setState('ready')
      })
      .catch(() => setState('expired'))
  }, [token])

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
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {mapa && <StudioMap mapaJson={mapa} activeNodeId={null} />}
    </div>
  )
}
