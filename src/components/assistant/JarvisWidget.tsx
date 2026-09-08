'use client'

import { useRef, useState } from 'react'
import { JarvisFullscreen } from './JarvisFullscreen'

export function JarvisWidget() {
  const [immersive, setImmersive] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const outputAnalyserRef = useRef<AnalyserNode | null>(null)

  function openJarvis() {
    // Must happen synchronously inside this click handler — creating/resuming the
    // AudioContext and doing a silent play() here is what lets Safari/iOS allow
    // audio playback later, even after the async fetch to ElevenLabs completes.
    // The <audio> element and its MediaElementSource are created ONCE here (not
    // inside JarvisFullscreen, which unmounts/remounts every open/close) because
    // an element can only ever be attached to a source node a single time.
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new Ctx() as AudioContext
      audioCtxRef.current = ctx
      const audioEl = new Audio()
      audioElRef.current = audioEl
      const source = ctx.createMediaElementSource(audioEl)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyser.connect(ctx.destination)
      outputAnalyserRef.current = analyser
    }
    const ctx = audioCtxRef.current
    const audioEl = audioElRef.current!
    ctx.resume().catch(() => {})
    audioEl.muted = true
    audioEl
      .play()
      .then(() => {
        audioEl.pause()
        audioEl.muted = false
      })
      .catch(() => {
        audioEl.muted = false
      })

    setImmersive(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={openJarvis}
        aria-label="Abrir Jarvis"
        className="fixed bottom-20 lg:bottom-6 right-5 z-[60] flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full glass hud-border group"
      >
        <span className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0">
          <span
            className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 animate-pulse-glow"
            style={{ filter: 'blur(5px)' }}
          />
          <span className="relative w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 border border-cyan-300/40 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
              <circle cx="12" cy="12" r="7.5" strokeWidth={1.2} opacity={0.6} />
            </svg>
          </span>
        </span>
        <span className="font-display text-sm font-semibold tracking-[0.15em] gradient-text">JARVIS</span>
      </button>

      {immersive && audioCtxRef.current && audioElRef.current && outputAnalyserRef.current && (
        <JarvisFullscreen
          onClose={() => setImmersive(false)}
          audioCtx={audioCtxRef.current}
          audioEl={audioElRef.current}
          outputAnalyser={outputAnalyserRef.current}
        />
      )}
    </>
  )
}
