'use client'

import { useRef, useState } from 'react'
import { JarvisFullscreen } from './JarvisFullscreen'

export function JarvisWidget() {
  const [immersive, setImmersive] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  function openJarvis() {
    // Must happen synchronously inside this click handler — creating/resuming the
    // AudioContext and priming the <audio> element here is what lets Safari/iOS
    // allow playback later, even after the async round-trip to Claude + ElevenLabs.
    //
    // The TTS audio plays as a PLAIN <audio> element (no Web Audio routing) —
    // routing it through an AnalyserNode for the reactor's visuals used to make
    // Safari silently suspend the AudioContext after a period of inactivity,
    // which cuts the element's native output too (createMediaElementSource
    // permanently redirects an element's audio through the graph), producing
    // total silence with no error. Direct playback has none of that risk; the
    // AudioContext here is only used for the microphone's level metering.
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new Ctx() as AudioContext
    }
    if (!audioElRef.current) {
      audioElRef.current = new Audio()
    }
    const ctx = audioCtxRef.current
    const audioEl = audioElRef.current
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

      {immersive && audioCtxRef.current && audioElRef.current && (
        <JarvisFullscreen
          onClose={() => setImmersive(false)}
          audioCtx={audioCtxRef.current}
          audioEl={audioElRef.current}
        />
      )}
    </>
  )
}
