'use client'

import { useEffect, useRef, useState } from 'react'
import { JarvisReactor, JarvisState } from './JarvisReactor'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface JarvisFullscreenProps {
  onClose: () => void
}

const BARGE_IN_MIN_CHARS = 3 // ignore stray noise picked up as a 1-2 char interim result

function computeRms(data: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  const rms = Math.sqrt(sum / data.length)
  return Math.min(1, rms * 4) // empirical gain so normal speech reads ~0.3-0.8
}

export function JarvisFullscreen({ onClose }: JarvisFullscreenProps) {
  const [state, setState] = useState<JarvisState>('idle')
  const [supported, setSupported] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const stateRef = useRef<JarvisState>('idle')
  const levelRef = useRef(0)
  const historyRef = useRef<ChatMessage[]>([])
  const closedRef = useRef(false)

  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const meterRafRef = useRef<number>(0)
  const currentObjectUrlRef = useRef<string | null>(null)

  function setJarvisState(next: JarvisState) {
    stateRef.current = next
    setState(next)
  }

  function meterFromMic() {
    const analyser = micAnalyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.fftSize)
    const loop = () => {
      if (closedRef.current) return
      if (stateRef.current === 'listening' && micAnalyserRef.current) {
        micAnalyserRef.current.getByteTimeDomainData(data)
        levelRef.current = computeRms(data)
      }
      meterRafRef.current = requestAnimationFrame(loop)
    }
    loop()
  }

  function stopPlayback() {
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.currentTime = 0
    }
    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current)
      currentObjectUrlRef.current = null
    }
  }

  function bargeIn() {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') return
    chatAbortRef.current?.abort()
    stopPlayback()
    setJarvisState('listening')
  }

  async function speak(text: string) {
    setJarvisState('speaking')
    try {
      const res = await fetch('/api/assistant/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok || stateRef.current !== 'speaking') return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      currentObjectUrlRef.current = url

      const ctx = audioCtxRef.current
      const audioEl = audioElRef.current
      if (!ctx || !audioEl) return
      audioEl.src = url

      if (ctx.state === 'suspended') await ctx.resume()
      const source = ctx.createMediaElementSource(audioEl)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyser.connect(ctx.destination)
      const data = new Uint8Array(analyser.fftSize)

      const meterOutput = () => {
        if (closedRef.current || stateRef.current !== 'speaking') return
        analyser.getByteTimeDomainData(data)
        levelRef.current = computeRms(data)
        requestAnimationFrame(meterOutput)
      }
      meterOutput()

      audioEl.onended = () => {
        if (stateRef.current === 'speaking') setJarvisState('listening')
      }
      await audioEl.play()
    } catch {
      if (stateRef.current === 'speaking') setJarvisState('listening')
    }
  }

  async function handleUserUtterance(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setJarvisState('thinking')
    historyRef.current = [...historyRef.current, { role: 'user' as const, content: trimmed }].slice(-20)

    const controller = new AbortController()
    chatAbortRef.current = controller
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const data = await res.json()
      const reply: string = data.reply ?? 'No pude procesar eso.'
      historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: reply }].slice(-20)
      if (stateRef.current === 'thinking') await speak(reply)
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError' && stateRef.current === 'thinking') {
        setJarvisState('listening')
      }
    }
  }

  useEffect(() => {
    closedRef.current = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      return
    }

    let cancelled = false

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        micStreamRef.current = stream
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        micAnalyserRef.current = analyser
        meterFromMic()
      } catch {
        setErrorMsg('No pude acceder al micrófono. Revisa los permisos del navegador.')
        return
      }

      const recognition = new SpeechRecognition()
      recognition.lang = 'es-CO'
      recognition.continuous = true
      recognition.interimResults = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1]
        const transcript = result[0]?.transcript ?? ''
        if (!result.isFinal) {
          if (stateRef.current === 'speaking' || stateRef.current === 'thinking') {
            if (transcript.trim().length >= BARGE_IN_MIN_CHARS) bargeIn()
          }
          return
        }
        if (stateRef.current !== 'thinking') handleUserUtterance(transcript)
      }
      recognition.onend = () => {
        if (!closedRef.current) {
          try {
            recognition.start()
          } catch {
            // already running — ignore
          }
        }
      }
      recognition.onerror = (e: { error: string }) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setErrorMsg('Permiso de micrófono denegado.')
        }
      }
      recognitionRef.current = recognition
      recognition.start()
      setJarvisState('listening')
    }

    init()

    return () => {
      cancelled = true
      closedRef.current = true
      cancelAnimationFrame(meterRafRef.current)
      recognitionRef.current?.stop()
      stopPlayback()
      micStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioCtxRef.current?.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const STATE_LABEL: Record<JarvisState, string> = {
    idle: 'Iniciando…',
    listening: 'Escuchando',
    thinking: 'Pensando…',
    speaking: 'Hablando',
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#05060a] flex flex-col items-center justify-center overflow-hidden">
      {/* Ambient grid backdrop */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.08), transparent 55%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: 'auto, 48px 48px, 48px 48px',
        }}
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar Jarvis"
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative z-10 flex flex-col items-center gap-6">
        {!supported ? (
          <p className="text-slate-400 text-sm max-w-xs text-center">
            Tu navegador no soporta reconocimiento de voz. Prueba en Chrome o Edge.
          </p>
        ) : errorMsg ? (
          <p className="text-red-400 text-sm max-w-xs text-center">{errorMsg}</p>
        ) : (
          <>
            <div className="w-[70vw] h-[70vw] max-w-[420px] max-h-[420px]">
              <JarvisReactor state={state} levelRef={levelRef} />
            </div>
            <p className="font-display text-xs tracking-[0.3em] uppercase text-slate-500">
              {STATE_LABEL[state]}
            </p>
          </>
        )}
      </div>

      <audio ref={audioElRef} className="hidden" />
    </div>
  )
}
