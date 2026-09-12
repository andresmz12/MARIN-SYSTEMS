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

// Still too sensitive at 8 chars / streak 2 — it was cutting Jarvis off from
// its own voice bleeding back into the mic (browser echoCancellation on a
// plain <audio> element is not perfectly reliable, especially on iOS Safari),
// not from the user actually talking. Three defenses now, all required at
// once: a longer, clearly-sustained transcript, more consecutive confirms,
// and an actual loud mic level (not just picked-up echo) at the same time.
const BARGE_IN_MIN_CHARS = 16
const BARGE_IN_STREAK_NEEDED = 3
const BARGE_IN_MIN_LEVEL = 0.32
// Ignore barge-in entirely for a moment after Jarvis starts talking — the
// first instant of playback is the likeliest spot for an echo/pop false-positive.
const BARGE_IN_GRACE_MS = 900

// The first chunk is spoken as soon as one sentence exists (fastest possible
// start). Later chunks group sentences up to this length before being sent, so
// ElevenLabs synthesizes whole thoughts with continuous intonation instead of
// restarting its prosody at every single period.
const LATER_CHUNK_MIN_CHARS = 160

interface SpeechItem {
  text: string
  /** Pre-downloaded audio, ready before this chunk's turn arrives. Null for the
   * first chunk of a reply, which streams progressively instead (see speakOne). */
  blobUrl: Promise<string> | null
}

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
  const speakStartedAtRef = useRef(0)
  // Chunks of the reply arrive as Claude streams it; they're queued here and
  // played back-to-back through the single <audio> element instead of waiting
  // for the whole reply before speaking anything. Every chunk after the first
  // is downloaded in the background WHILE the previous one plays (blobUrl), so
  // the seams are gapless — fetching each one only when its turn came left a
  // dead pause at every sentence boundary, which is what made Jarvis sound
  // chopped up.
  const speechQueueRef = useRef<SpeechItem[]>([])
  const playingRef = useRef(false)
  const streamDoneRef = useRef(true)
  const firstChunkSentRef = useRef(false)
  const activeBlobUrlRef = useRef<string | null>(null)

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
      // Also measured while Jarvis is speaking/thinking — the reactor's visual
      // only reads this ref during 'listening' (speaking uses a synthetic
      // pulse instead), so this doesn't change anything on screen; it's purely
      // so bargeIn() below can require an actually-loud mic, not just a
      // transcript fragment that could be Jarvis's own voice echoing back.
      if (stateRef.current !== 'idle' && stateRef.current !== 'error' && micAnalyserRef.current) {
        micAnalyserRef.current.getByteTimeDomainData(data)
        levelRef.current = computeRms(data)
      }
      meterRafRef.current = requestAnimationFrame(loop)
    }
    loop()
  }

  function releaseActiveBlob() {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current)
      activeBlobUrlRef.current = null
    }
  }

  /** Drops every queued chunk, releasing the audio already downloaded for them. */
  function clearSpeechQueue() {
    for (const item of speechQueueRef.current) {
      item.blobUrl?.then((url) => URL.revokeObjectURL(url)).catch(() => {})
    }
    speechQueueRef.current = []
    playingRef.current = false
  }

  function stopPlayback() {
    // Clear handlers first — removing the src/load() below fires 'error'/'abort'
    // on the element, which would otherwise be mistaken for a real TTS failure.
    audioEl.onended = null
    audioEl.onerror = null
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
    releaseActiveBlob()
  }

  function bargeIn() {
    if (stateRef.current !== 'speaking' && stateRef.current !== 'thinking') return
    bargeInStreakRef.current = 0
    chatAbortRef.current?.abort()
    clearSpeechQueue()
    streamDoneRef.current = true
    stopPlayback()
    setJarvisState('listening')
  }

  function ttsUrl(text: string) {
    return `/api/assistant/speak?text=${encodeURIComponent(text)}`
  }

  /** Downloads a chunk's audio up front so it can start the instant its turn comes. */
  async function prefetchAudio(text: string): Promise<string> {
    const res = await fetch(ttsUrl(text))
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? `No se pudo generar el audio (HTTP ${res.status})`)
    }
    return URL.createObjectURL(await res.blob())
  }

  async function reportSpeakFailure(text: string, fallback: string) {
    try {
      const res = await fetch(ttsUrl(text))
      const body = await res.json().catch(() => null)
      const message: string = body?.error ?? fallback
      console.error('[jarvis] TTS failed:', message)
      setErrorMessage(message)
    } catch {
      console.error('[jarvis] TTS failed:', fallback)
      setErrorMessage(fallback)
    }
  }

  // Pulls the next queued chunk and plays it; when the queue runs dry it only
  // drops back to 'listening' once the chat stream has actually finished
  // (streamDoneRef) — otherwise more chunks are still on their way.
  function playNextInQueue() {
    const next = speechQueueRef.current.shift()
    if (!next) {
      playingRef.current = false
      if (streamDoneRef.current && stateRef.current === 'speaking') setJarvisState('listening')
      return
    }
    playingRef.current = true
    speakOne(next)
  }

  function enqueueSpeech(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const isFirst = !firstChunkSentRef.current
    firstChunkSentRef.current = true
    const blobUrl = isFirst ? null : prefetchAudio(trimmed)
    // Mark the prefetch as handled so a failure here isn't an unhandled
    // rejection; the real error surfaces where speakOne awaits it.
    blobUrl?.catch(() => {})
    speechQueueRef.current.push({ text: trimmed, blobUrl })
    if (!playingRef.current) playNextInQueue()
  }

  async function speakOne(item: SpeechItem) {
    setJarvisState('speaking')
    setErrorMessage(null)
    speakStartedAtRef.current = Date.now()
    releaseActiveBlob()

    let src: string
    try {
      if (item.blobUrl) {
        // Already downloaded while the previous chunk was playing — starts instantly.
        src = await item.blobUrl
        if (closedRef.current) {
          URL.revokeObjectURL(src)
          return
        }
        activeBlobUrlRef.current = src
      } else {
        // First chunk of the reply: setting `src` directly lets the <audio>
        // element stream the response progressively as ElevenLabs generates
        // it, instead of waiting for the full clip before a single sample
        // plays. Worth the slightly less precise error reporting.
        src = ttsUrl(item.text)
      }
    } catch (err) {
      console.error('[jarvis] prefetch failed, skipping chunk:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Error generando audio')
      playNextInQueue()
      return
    }

    try {
      audioEl.src = src
      audioEl.muted = false
      audioEl.volume = 1

      // Move on to the next queued chunk instead of always dropping back to
      // 'listening' — see playNextInQueue for when it actually stops.
      audioEl.onended = () => playNextInQueue()
      // A blocked/failed media load (CSP, corrupt data, codec, or the server
      // rejecting the TTS request) doesn't always reject play() — it can
      // instead fire a silent 'error' event on the element, which used to
      // leave the reactor stuck showing "speaking" forever with no sound.
      audioEl.onerror = () => {
        if (item.blobUrl) {
          // The audio downloaded fine, so this is a decode/playback failure —
          // re-requesting it would just return valid audio again.
          console.error('[jarvis] <audio> failed to play a prefetched chunk:', audioEl.error)
          setErrorMessage('El audio no se pudo reproducir')
        } else {
          reportSpeakFailure(item.text, 'Error de audio (revisa la consola)')
        }
        setJarvisState('error')
        setTimeout(() => playNextInQueue(), 900)
      }
      await audioEl.play()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[jarvis] speakOne() failed, skipping to next:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Error desconocido')
      playNextInQueue()
    }
  }

  // Splits complete sentences off the front of `buffer` (so each can be sent
  // to TTS immediately) and returns whatever incomplete fragment is left.
  // Guards against splitting a decimal like "3.5" into two sentences.
  function splitSentences(buffer: string): { complete: string[]; rest: string } {
    const complete: string[] = []
    let start = 0
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer[i]
      if (c === '.' || c === '!' || c === '?' || c === '\n') {
        if (c === '.' && /\d/.test(buffer[i + 1] ?? '')) continue
        const piece = buffer.slice(start, i + 1).trim()
        if (piece) complete.push(piece)
        start = i + 1
      }
    }
    return { complete, rest: buffer.slice(start) }
  }

  async function handleUserUtterance(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setJarvisState('thinking')
    setErrorMessage(null)
    historyRef.current = [...historyRef.current, { role: 'user' as const, content: trimmed }].slice(-20)

    const controller = new AbortController()
    chatAbortRef.current = controller
    streamDoneRef.current = false
    firstChunkSentRef.current = false
    let sentenceBuffer = ''
    let pendingChunk = ''
    let spokenAny = false
    let finalReply = ''
    let accumulatedText = ''

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyRef.current }),
        signal: controller.signal,
      })
      if (!res.body) throw new Error('Sin cuerpo de respuesta')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let leftover = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        leftover += decoder.decode(value, { stream: true })
        let nlIdx: number
        while ((nlIdx = leftover.indexOf('\n')) >= 0) {
          const line = leftover.slice(0, nlIdx).trim()
          leftover = leftover.slice(nlIdx + 1)
          if (!line) continue
          const evt = JSON.parse(line) as { type: string; delta?: string; reply?: string; error?: string }
          if (evt.type === 'text' && evt.delta) {
            sentenceBuffer += evt.delta
            accumulatedText += evt.delta
            const { complete, rest } = splitSentences(sentenceBuffer)
            for (const sentence of complete) {
              pendingChunk = pendingChunk ? `${pendingChunk} ${sentence}` : sentence
              // Send the very first chunk the moment one sentence is ready;
              // after that hold sentences together into longer chunks so each
              // request covers a whole thought.
              const minChars = firstChunkSentRef.current ? LATER_CHUNK_MIN_CHARS : 0
              if (pendingChunk.length >= minChars) {
                enqueueSpeech(pendingChunk)
                pendingChunk = ''
                spokenAny = true
              }
            }
            sentenceBuffer = rest
          } else if (evt.type === 'done') {
            finalReply = evt.reply ?? ''
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'Error del servidor')
          }
        }
      }

      if (controller.signal.aborted) return
      const tail = `${pendingChunk} ${sentenceBuffer}`.trim()
      if (tail) {
        enqueueSpeech(tail)
        spokenAny = true
      }
      streamDoneRef.current = true
      historyRef.current = [...historyRef.current, { role: 'assistant' as const, content: finalReply || accumulatedText.trim() || 'No pude procesar eso.' }].slice(-20)
      if (!spokenAny && stateRef.current === 'thinking') setJarvisState('listening')
    } catch (err) {
      streamDoneRef.current = true
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
            const withinGrace = Date.now() - speakStartedAtRef.current < BARGE_IN_GRACE_MS
            const loudEnough = levelRef.current >= BARGE_IN_MIN_LEVEL
            if (!withinGrace && loudEnough && transcript.trim().length >= BARGE_IN_MIN_CHARS) {
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
      chatAbortRef.current?.abort()
      clearSpeechQueue()
      streamDoneRef.current = true
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
