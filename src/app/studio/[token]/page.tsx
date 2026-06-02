'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const StudioMap = dynamic(() => import('@/components/studio/StudioMap'), { ssr: false })

interface Timestamp { nodoId: string; inicio: number; fin: number }

interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: Array<{
    id: string; emoji: string; texto: string; color: string
    hijos: Array<{ id: string; texto: string; color: string }>
  }>
}

interface SessionData {
  tema: string
  redSocial: string
  duracion: string
  mapaJson: MapaJson
  guion: string
  timestamps: Timestamp[]
}

type State = 'loading' | 'ready' | 'error'

function nodeColor(id: string | null, mapa: MapaJson): string {
  if (!id) return '#6366f1'
  if (id === mapa.centro.id) return mapa.centro.color
  for (const r of mapa.ramas) {
    if (r.id === id) return r.color
    for (const h of r.hijos) if (h.id === id) return h.color
  }
  return '#6366f1'
}

export default function StudioPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [state,    setState]    = useState<State>('loading')
  const [data,     setData]     = useState<SessionData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [playing,     setPlaying]     = useState(false)
  const [showGuion,   setShowGuion]   = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [audioProgress, setAudioProgress] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const rafRef   = useRef<number | null>(null)

  useEffect(() => {
    fetch(`/api/studio/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error === 'expired' ? 'Este enlace ha expirado.' : 'Contenido no encontrado.')
        }
        return res.json() as Promise<SessionData>
      })
      .then((d) => { setData(d); setState('ready') })
      .catch((e) => { setErrorMsg(e.message); setState('error') })
  }, [token])

  function startSync(timestamps: Timestamp[]) {
    function loop() {
      const audio = audioRef.current
      if (!audio) return
      const t   = audio.currentTime
      const dur = audio.duration || 1
      setAudioProgress(t / dur)
      const active = timestamps.find(ts => t >= ts.inicio && t < ts.fin) ?? null
      setActiveNodeId(active?.nodoId ?? null)
      rafRef.current = requestAnimationFrame(loop)
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
  }

  function stopSync() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setActiveNodeId(null)
    setAudioProgress(0)
  }

  function toggleAudio() {
    if (!audioRef.current) {
      const el = new Audio(`/api/studio/${token}/audio`)
      el.onended = () => { setPlaying(false); stopSync() }
      audioRef.current = el
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
      stopSync()
    } else {
      audioRef.current.play()
      setPlaying(true)
      startSync(data?.timestamps ?? [])
    }
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(0,0,0,0.1)', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontFamily: 'system-ui', color: '#666', opacity: 0.8 }}>Cargando estudio…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ minHeight: '100dvh', background: '#fafaf8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontFamily: 'system-ui', fontSize: 18, color: '#333' }}>{errorMsg}</p>
        </div>
      </div>
    )
  }

  const activeColor = data ? nodeColor(activeNodeId, data.mapaJson) : '#6366f1'

  return (
    <div style={{ width: '100dvw', height: '100dvh', background: '#fafaf8', position: 'relative', overflow: 'hidden' }}>
      {/* Map fills entire viewport */}
      <div style={{ width: '100%', height: '100%' }}>
        <StudioMap mapaJson={data!.mapaJson} activeNodeId={activeNodeId} />
      </div>

      {/* Audio play/pause */}
      <button onClick={toggleAudio}
        style={{
          position: 'absolute', bottom: 32, right: 24,
          width: 64, height: 64, borderRadius: '50%',
          background: playing ? '#ef4444' : '#6366f1',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          transition: 'background 0.2s', zIndex: 20,
        }}
        title={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? '⏸' : '▶️'}
      </button>

      {/* Script toggle */}
      <button onClick={() => setShowGuion(v => !v)}
        style={{
          position: 'absolute', bottom: 32, right: 104,
          width: 64, height: 64, borderRadius: '50%',
          background: showGuion ? 'rgba(99,102,241,0.18)' : 'rgba(0,0,0,0.06)',
          border: '1px solid rgba(99,102,241,0.25)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          transition: 'background 0.2s', zIndex: 20,
        }}
        title="Ver guion">📝</button>

      {showGuion && (
        <div style={{
          position: 'absolute', bottom: 112, left: 16, right: 16,
          maxHeight: '40dvh', overflowY: 'auto',
          background: 'rgba(250,250,248,0.97)',
          border: '1px solid rgba(99,102,241,0.2)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          borderRadius: 16, padding: '20px 24px', zIndex: 20,
        }}>
          <p style={{
            color: 'rgba(20,20,35,0.88)',
            fontFamily: "'Caveat', cursive",
            fontSize: 18, lineHeight: 1.7,
            margin: 0, whiteSpace: 'pre-wrap',
          }}>
            {data!.guion}
          </p>
        </div>
      )}

      {/* Progress bar — 3px at very bottom, color of active node */}
      {playing && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, background: 'rgba(0,0,0,0.08)', zIndex: 25,
          pointerEvents: 'none',
        }}>
          <div style={{
            height: '100%',
            width: `${audioProgress * 100}%`,
            background: activeColor,
            transition: 'width 0.1s linear, background 0.4s ease',
          }} />
        </div>
      )}
    </div>
  )
}
