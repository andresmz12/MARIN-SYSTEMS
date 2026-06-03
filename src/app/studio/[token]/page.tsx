'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'

const StudioMap = dynamic(() => import('@/components/studio/StudioMap'), { ssr: false })

interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: Array<{
    id: string; emoji: string; texto: string; color: string
    hijos: Array<{ id: string; texto: string; color: string }>
  }>
}

interface PropTs { id: string; inicio: number; fin: number }

interface SessionData {
  tema: string
  redSocial: string
  duracion: string
  mapaJson: MapaJson
  guion: string
  timestamps: PropTs[]
}

type State = 'loading' | 'ready' | 'error'

function isValidMapa(mapa: any): boolean {
  return !!(
    mapa?.centro?.id && mapa?.centro?.color &&
    Array.isArray(mapa?.ramas) && mapa.ramas.length > 0 &&
    mapa.ramas.every((r: any) => r?.id && r?.color && Array.isArray(r?.hijos))
  )
}

export default function StudioPage({ params }: { params: { token: string } }) {
  const { token } = params
  const [state,    setState]    = useState<State>('loading')
  const [data,     setData]     = useState<SessionData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const [playing,      setPlaying]      = useState(false)
  const [audioReady,   setAudioReady]   = useState(false)
  const [showGuion,    setShowGuion]    = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [progreso,     setProgreso]     = useState(0)

  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef   = useRef<number>(0)
  const tsRef    = useRef<PropTs[]>([])

  useEffect(() => {
    fetch(`/api/studio/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error === 'expired' ? 'Este enlace ha expirado.' : 'Contenido no encontrado.')
        }
        return res.json()
      })
      .then((d) => {
        if (!isValidMapa(d?.mapaJson)) throw new Error('El mapa de este studio es inválido.')
        d.timestamps = d.timestamps ?? []
        setData(d as SessionData)
        setState('ready')
      })
      .catch((e) => { setErrorMsg(e.message); setState('error') })
  }, [token])

  function loop() {
    const audio = audioRef.current
    if (!audio || !tsRef.current.length) return
    const t = audio.currentTime
    const active = tsRef.current.find(n => t >= n.inicio && t < n.fin) ?? null
    setActiveNodeId(active?.id ?? null)
    setProgreso(t / (audio.duration || 1))
    if (!audio.paused && !audio.ended) {
      rafRef.current = requestAnimationFrame(loop)
    }
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (!audio || !data) return
    const dur = audio.duration
    tsRef.current = data.timestamps.map(ts => ({
      id:     ts.id,
      inicio: ts.inicio * dur,
      fin:    ts.fin    * dur,
    }))
  }

  function handleCanPlay()  { setAudioReady(true) }
  function handlePlay()     { rafRef.current = requestAnimationFrame(loop); setPlaying(true) }
  function handlePause()    { cancelAnimationFrame(rafRef.current); setPlaying(false) }
  function handleEnded()    {
    cancelAnimationFrame(rafRef.current)
    setActiveNodeId(null)
    setProgreso(0)
    setPlaying(false)
  }

  function toggleAudio() {
    const audio = audioRef.current
    if (!audio || !audioReady) return
    audio.paused ? audio.play() : audio.pause()
  }

  async function handleDescargar() {
    const res = await fetch(`/api/studio/${token}/audio`)
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

  const centerColor = data!.mapaJson.centro.color

  return (
    <div style={{ width: '100dvw', height: '100dvh', background: '#fafaf8', position: 'relative', overflow: 'hidden', colorScheme: 'light' }}>
      <style>{`html,body{background:#fafaf8 !important;color-scheme:light !important;}`}</style>

      {/* Hidden audio element — preloads on mount */}
      <audio
        ref={audioRef}
        src={`/api/studio/${token}/audio`}
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        style={{ display: 'none' }}
      />

      {/* Map fills entire viewport */}
      <div style={{ width: '100%', height: '100%' }}>
        <StudioMap mapaJson={data!.mapaJson} activeNodeId={activeNodeId} />
      </div>

      {/* Download audio */}
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
        title="Descargar MP3">
        ⬇️
      </button>

      {/* Play/pause — dimmed while audio not ready */}
      <button
        onClick={toggleAudio}
        disabled={!audioReady}
        style={{
          position: 'fixed', bottom: 32, right: 24,
          width: 64, height: 64, borderRadius: '50%',
          background: playing ? '#ef4444' : centerColor,
          border: 'none', cursor: audioReady ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
          transition: 'background 0.2s, opacity 0.2s',
          opacity: audioReady ? 1 : 0.45,
          zIndex: 50,
        }}
        title={audioReady ? (playing ? 'Pausar' : 'Reproducir') : 'Cargando audio…'}>
        {!audioReady
          ? <span style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
          : playing ? '⏸' : '▶️'}
      </button>

      {/* Script toggle */}
      <button onClick={() => setShowGuion(v => !v)}
        style={{
          position: 'fixed', bottom: 32, right: 104,
          width: 64, height: 64, borderRadius: '50%',
          background: showGuion ? 'rgba(99,102,241,0.18)' : 'rgba(0,0,0,0.06)',
          border: '1px solid rgba(99,102,241,0.25)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          transition: 'background 0.2s', zIndex: 50,
        }}
        title="Ver guion">📝</button>

      {showGuion && (
        <div style={{
          position: 'fixed', bottom: 112, left: 16, right: 16,
          maxHeight: '40dvh', overflowY: 'auto',
          background: 'rgba(250,250,248,0.97)',
          border: '1px solid rgba(99,102,241,0.2)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          borderRadius: 16, padding: '20px 24px', zIndex: 50,
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

      {/* Progress bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 4, background: '#eee', zIndex: 50,
        pointerEvents: 'none',
      }}>
        <div style={{
          height: '100%',
          width: `${progreso * 100}%`,
          background: centerColor,
          transition: 'width 0.1s linear',
        }} />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
