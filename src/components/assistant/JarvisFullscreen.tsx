'use client'

import { useEffect, useRef, useState } from 'react'
import { JarvisReactor, JarvisState } from './JarvisReactor'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface JarvisFullscreenProps {
  onClose: () => void
  /** AudioContext used only for the microphone level meter (the "listening" pulse).
   * Created synchronously in the launcher's click handler and persisted there (not
   * here) so it survives this component's unmount/remount on close/reopen. */
  audioCtx: AudioContext
  /** Plays TTS audio natively (no Web Audio routing — see speak() for why). Primed
   * with a silent play() in that same click so Safari/iOS allows it later. */
  audioEl: HTMLAudioElement
}

// A short/noisy interim result (echo, a stray "ah", background sound) used to
// cut Jarvis off after a single 3-character fragment. Barge-in now needs a
// real word-or-more AND two consecutive interim results confirming it, so
// Jarvis only gets interrupted by sustained speech, not a blip.
const BARGE_IN_MIN_CHARS = 8
const BARGE_IN_STREAK_NEEDED = 2

function computeRms(data: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  const rms = Math.sqrt(sum / data.length)
  return Math.min(1, rms * 4) // empirical gain so normal speech reads ~0.3-0.8
}

export function JarvisFullscreen({ onClose, audioCtx, audioEl }: JarvisFullscreenProps) {
  const [state, setState] = useState<JarvisState>('idle')
  // The <audio> element only ever reports a generic "failed to load" — when
  // the server actually rejected the TTS request (bad voice id, no credits,
  // invalid key) that real reason is in the response body, which a plain
  // `src=` assignment never reads. Re-fetching the same URL on error recovers
  // it so it's visible instead of only "no sound, no idea why".
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stateRef = useRef<JarvisState>('idle')
  const levelRef = useRef(0)
  const historyRef = useRef<ChatMessage[]>([])
  const closedRef = useRef(false)

  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const chatAbortRef = useRef<AbortController | null>(null)
  const meterRafRef = useRef<number>(0)
  const bargeInStreakRef = useRef(0)

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
    // Clear handlers first — removing the src/load() below fires 'error'/'abort'
    // on the element, which would otherwise be mistaken for a real TTS failure.
    audioEl.onended = null
    audioEl.onerror = null
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  }

  function bargeIn() {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') return
    bargeInStreakRef.current = 0
    chatAbortRef.current?.abort()
    stopPlayback()
    setJarvisState('listening')
  }

  async function reportSpeakFailure(url: string, fallback: string) {
    try {
      const res = await fetch(url)
      const body = await res.json().catch(() => null)
      const message: string = body?.error ?? fallback
      console.error('[jarvis] TTS failed:', message)
      setErrorMessage(message)
    } catch {
      console.error('[jarvis] TTS failed:', fallback)
      setErrorMessage(fallback)
    }
  }

  async function speak(text: string) {
    setJarvisState('speaking')
    setErrorMessage(null)
    const url = `/api/assistant/speak?text=${encodeURIComponent(text)}`
    try {
      // No fetch()+blob() here on purpose — setting `src` directly lets the
      // <audio> element stream the response progressively as ElevenLabs
      // generates it, instead of blocking on the full clip twice (once
      // server<-ElevenLabs, once client<-server) before a single sample plays.
      audioEl.src = url
      audioEl.muted = false
      audioEl.volume = 1

      audioEl.onended = () => {
        if (stateRef.current === 'speaking') setJarvisState('listening')
      }
      // A blocked/failed media load (CSP, corrupt blob, codec, or the server
      // rejecting the TTS request) doesn't always reject play() — it can
      // instead fire a silent 'error' event on the element, which used to
      // leave the reactor stuck showing "speaking" forever with no sound.
      audioEl.onerror = () => {
        if (stateRef.current === 'speaking') {
          setJarvisState('error')
          reportSpeakFailure(url, 'Error de audio (revisa la consola)')
          setTimeout(() => {
            if (stateRef.current === 'error') setJarvisState('listening')
          }, 2500)
        }
      }
      await audioEl.play()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[jarvis] speak() failed, recovering to listening:', err)
      if (stateRef.current === 'speaking') {
        // Flash red briefly so a failure is visible instead of silently getting stuck.
        setJarvisState('error')
        setErrorMessage(err instanceof Error ? err.message : 'Error desconocido')
        setTimeout(() => {
          if (stateRef.current === 'error') setJarvisState('listening')
        }, 2500)
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
            if (transcript.trim().length >= BARGE_IN_MIN_CHARS) {
              bargeInStreakRef.current += 1
              if (bargeInStreakRef.current >= BARGE_IN_STREAK_NEEDED) bargeIn()
            } else {
              bargeInStreakRef.current = 0
            }
          }
          return
        }
        bargeInStreakRef.current = 0
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
            state === 'error' ? 'rgba(239,68,68,0.14)' : 'rgba(251,191,36,0.12)'
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
          backgroundImage: 'linear-gradient(180deg, transparent, rgba(251,191,36,0.16), transparent)',
          backgroundSize: '100% 50%',
        }}
      />
      {/* Corner HUD brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <div
          key={corner}
          className={`absolute w-10 h-10 border-amber-400/30 ${
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

      {errorMessage && (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 max-w-[85vw] text-center text-xs text-red-400 bg-black/60 border border-red-500/30 rounded-lg px-3 py-2">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
