'use client'

import { useEffect, useRef, useState } from 'react'
import { JarvisReactor, JarvisState } from './JarvisReactor'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface JarvisFullscreenProps {
  onClose: () => void
  /** Created synchronously inside the launcher's click handler so iOS/Safari treats
   * later programmatic playback (after an async fetch) as part of that user gesture.
   * Persisted in the parent (not here) because an <audio> element can only ever be
   * attached to a MediaElementSourceNode once — this component unmounts on close. */
  audioCtx: AudioContext
  audioEl: HTMLAudioElement
  outputAnalyser: AnalyserNode
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

export function JarvisFullscreen({ onClose, audioCtx, audioEl, outputAnalyser }: JarvisFullscreenProps) {
  const [state, setState] = useState<JarvisState>('idle')

  const stateRef = useRef<JarvisState>('idle')
  const levelRef = useRef(0)
  const historyRef = useRef<ChatMessage[]>([])
  const closedRef = useRef(false)

  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
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

  function meterFromOutput() {
    const data = new Uint8Array(outputAnalyser.fftSize)
    const loop = () => {
      if (closedRef.current) return
      if (stateRef.current === 'speaking') {
        outputAnalyser.getByteTimeDomainData(data)
        levelRef.current = computeRms(data)
        requestAnimationFrame(loop)
      }
    }
    loop()
  }

  function stopPlayback() {
    audioEl.pause()
    audioEl.currentTime = 0
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
      if (stateRef.current !== 'speaking') return // interrupted while we were fetching
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // eslint-disable-next-line no-console
        console.error('[jarvis] /api/assistant/speak failed:', res.status, body?.error)
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      if (stateRef.current !== 'speaking') return
      const url = URL.createObjectURL(blob)
      currentObjectUrlRef.current = url
      audioEl.src = url

      if (audioCtx.state === 'suspended') await audioCtx.resume()
      meterFromOutput()
      audioEl.onended = () => {
        if (stateRef.current === 'speaking') setJarvisState('listening')
      }
      await audioEl.play()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[jarvis] speak() failed, recovering to listening:', err)
      if (stateRef.current === 'speaking') {
        // Flash red briefly so a failure is visible instead of silently getting stuck.
        setJarvisState('error')
        setTimeout(() => {
          if (stateRef.current === 'error') setJarvisState('listening')
        }, 900)
      }
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
      setJarvisState('error')
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
        const micSource = audioCtx.createMediaStreamSource(stream)
        const micAnalyser = audioCtx.createAnalyser()
        micAnalyser.fftSize = 256
        micSource.connect(micAnalyser)
        micAnalyserRef.current = micAnalyser
        meterFromMic()
      } catch {
        setJarvisState('error')
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
          setJarvisState('error')
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[100] bg-[#05060a] flex flex-col items-center justify-center overflow-hidden">
      {/* Ambient grid + moving scan sweep */}
      <div
        className="absolute inset-0 transition-[background] duration-700 ease-out"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 45%, ${
            state === 'error' ? 'rgba(239,68,68,0.14)' : 'rgba(34,211,238,0.10)'
          }, transparent 58%)`,
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '44px 44px, 44px 44px',
        }}
      />
      <div
        className="absolute inset-x-0 h-40 opacity-20 animate-scan pointer-events-none"
        style={{
          top: 0,
          bottom: 0,
          backgroundImage: 'linear-gradient(180deg, transparent, rgba(34,211,238,0.14), transparent)',
          backgroundSize: '100% 50%',
        }}
      />
      {/* Corner HUD brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <div
          key={corner}
          className={`absolute w-10 h-10 border-cyan-400/25 ${
            corner === 'tl' ? 'top-6 left-6 border-t border-l' :
            corner === 'tr' ? 'top-6 right-6 border-t border-r' :
            corner === 'bl' ? 'bottom-6 left-6 border-b border-l' :
            'bottom-6 right-6 border-b border-r'
          }`}
        />
      ))}

      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="relative z-10 w-[78vw] h-[78vw] max-w-[480px] max-h-[480px]">
        <JarvisReactor state={state} levelRef={levelRef} />
      </div>
    </div>
  )
}
