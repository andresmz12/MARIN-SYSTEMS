'use client'

import { useEffect, useRef, useState } from 'react'
import { JarvisFullscreen } from './JarvisFullscreen'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const GREETING: ChatMessage = {
  role: 'assistant',
  content: 'Aquí estoy. Pregúntame por tu trading, hábitos o el estado de tus agentes.',
}

export function JarvisWidget() {
  const [open, setOpen] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceOn, setVoiceOn] = useState(true)
  const [speechSupported, setSpeechSupported] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    setSpeechSupported(true)
    const recognition = new SpeechRecognition()
    recognition.lang = 'es-CO'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript) {
        setInput(transcript)
        sendMessage(transcript)
      }
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
  }, [])

  function speak(text: string) {
    if (!voiceOn || typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-CO'
    utterance.rate = 1.02
    window.speechSynthesis.speak(utterance)
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = await res.json()
      const reply: string = data.reply ?? 'No pude procesar eso.'
      setMessages([...nextMessages, { role: 'assistant', content: reply }])
      speak(reply)
    } catch {
      setMessages([...nextMessages, { role: 'assistant', content: 'Perdí la conexión. Intenta de nuevo.' }])
    } finally {
      setLoading(false)
    }
  }

  function toggleListening() {
    if (!recognitionRef.current) return
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
    } else {
      setListening(true)
      recognitionRef.current.start()
    }
  }

  return (
    <>
      {/* Floating orb */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Abrir asistente Jarvis"
        className="fixed bottom-20 lg:bottom-6 right-5 z-[60] w-14 h-14 rounded-full flex items-center justify-center group"
      >
        <span
          className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 animate-pulse-glow"
          style={{ filter: 'blur(6px)' }}
        />
        <span className="relative w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-violet-600 border border-cyan-300/40 shadow-glow-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
            <circle cx="12" cy="12" r="7.5" strokeWidth={1.2} opacity={0.6} />
            <circle cx="12" cy="12" r="10.5" strokeWidth={1} opacity={0.35} />
          </svg>
        </span>
      </button>

      {open && (
        <div className="fixed bottom-36 lg:bottom-24 right-5 z-[60] w-[min(92vw,360px)] h-[min(70vh,520px)] flex flex-col rounded-2xl glass hud-border shadow-glow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--bg-border)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-display font-semibold text-sm gradient-text">J.A.R.V.I.S.</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setImmersive(true)}
                title="Modo inmersivo (solo voz)"
                className="p-1.5 rounded-md text-xs text-violet-300 hover:bg-[var(--bg-hover)]"
              >
                🎙️
              </button>
              <button
                type="button"
                onClick={() => setVoiceOn((v) => !v)}
                title={voiceOn ? 'Silenciar voz' : 'Activar voz'}
                className={`p-1.5 rounded-md text-xs ${voiceOn ? 'text-cyan-300' : 'text-slate-500'} hover:bg-[var(--bg-hover)]`}
              >
                {voiceOn ? '🔊' : '🔇'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-[var(--bg-hover)]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-snug ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-cyan-600/30 to-violet-600/30 border border-cyan-400/20 text-white'
                      : 'bg-[var(--bg-elevated)] border border-[var(--bg-border)] text-[var(--text-primary)]'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--bg-border)] text-slate-400">
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage(input)
            }}
            className="flex items-center gap-2 p-3 border-t border-[var(--bg-border)]"
          >
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                title="Hablar"
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
                  listening
                    ? 'bg-red-500/20 border-red-400/50 text-red-400 animate-pulse'
                    : 'bg-[var(--bg-elevated)] border-[var(--bg-border)] text-cyan-300 hover:bg-[var(--bg-hover)]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}
            <input
              className="input flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? 'Escuchando…' : 'Escríbeme algo…'}
              disabled={loading}
            />
          </form>
        </div>
      )}

      {immersive && <JarvisFullscreen onClose={() => setImmersive(false)} />}
    </>
  )
}
