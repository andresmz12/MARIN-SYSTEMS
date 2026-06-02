'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const StudioMap = dynamic(() => import('@/components/studio/StudioMap'), { ssr: false })

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
}

type State = 'loading' | 'ready' | 'error'

export default function StudioPage() {
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<State>('loading')
  const [data, setData] = useState<SessionData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [playing, setPlaying] = useState(false)
  const [showGuion, setShowGuion] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  function toggleAudio() {
    if (!audioRef.current) {
      const el = new Audio(`/api/studio/${token}/audio`)
      el.onended = () => setPlaying(false)
      audioRef.current = el
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.play()
      setPlaying(true)
    }
  }

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontFamily: 'system-ui', opacity: 0.7 }}>Cargando estudio…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={{ minHeight: '100dvh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'white', padding: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <p style={{ fontFamily: 'system-ui', fontSize: 18 }}>{errorMsg}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: '100dvw', height: '100dvh', background: '#1a1a2e', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '12px 20px',
        background: 'linear-gradient(to bottom, rgba(26,26,46,0.95), transparent)',
        zIndex: 10, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 20, fontFamily: "'Caveat', cursive", color: 'white', fontWeight: 700 }}>
          {data!.tema}
        </span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 99,
          background: 'rgba(99,102,241,0.3)', color: '#a5b4fc',
          fontFamily: 'system-ui', letterSpacing: 0.5,
        }}>
          {data!.redSocial} · {data!.duracion}
        </span>
      </div>

      <div style={{ width: '100%', height: '100%' }}>
        <StudioMap mapaJson={data!.mapaJson} />
      </div>

      <button onClick={toggleAudio}
        style={{
          position: 'absolute', bottom: 32, right: 24,
          width: 64, height: 64, borderRadius: '50%',
          background: playing ? '#ef4444' : '#6366f1',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          transition: 'background 0.2s', zIndex: 20,
        }}
        title={playing ? 'Pausar' : 'Reproducir guion'}
      >
        {playing ? '⏸' : '▶️'}
      </button>

      <button onClick={() => setShowGuion((v) => !v)}
        style={{
          position: 'absolute', bottom: 32, right: 104,
          width: 64, height: 64, borderRadius: '50%',
          background: showGuion ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.2)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          transition: 'background 0.2s', zIndex: 20,
        }}
        title="Ver guion"
      >
        📝
      </button>

      {showGuion && (
        <div style={{
          position: 'absolute', bottom: 112, left: 16, right: 16,
          maxHeight: '40dvh', overflowY: 'auto',
          background: 'rgba(15,15,35,0.95)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 16, padding: '20px 24px', zIndex: 20,
        }}>
          <p style={{
            color: 'rgba(255,255,255,0.9)',
            fontFamily: "'Caveat', cursive",
            fontSize: 18, lineHeight: 1.7,
            margin: 0, whiteSpace: 'pre-wrap',
          }}>
            {data!.guion}
          </p>
        </div>
      )}
    </div>
  )
}
