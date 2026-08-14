'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PreTradeChecklist } from '@/components/trading/PreTradeChecklist'
import { BreathingTimer } from '@/components/trading/BreathingTimer'
import { PreMarketHabits } from '@/components/trading/PreMarketHabits'

const MEDITATION_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
]

type FomoAnswer = 'plan' | 'emocion' | null

export default function MiSistemaPage() {
  const [fomoStarted, setFomoStarted] = useState(false)
  const [fomoDone, setFomoDone] = useState(false)
  const [fomoAnswer, setFomoAnswer] = useState<FomoAnswer>(null)
  const [fomoKey, setFomoKey] = useState(0)

  const [meditationSeconds, setMeditationSeconds] = useState(300)
  const [meditationKey, setMeditationKey] = useState(0)

  function startFomoProtocol() {
    setFomoAnswer(null)
    setFomoDone(false)
    setFomoStarted(true)
  }

  function restartFomoProtocol() {
    setFomoAnswer(null)
    setFomoDone(false)
    setFomoStarted(false)
    setFomoKey((k) => k + 1)
  }

  function changeMeditationPreset(seconds: number) {
    setMeditationSeconds(seconds)
    setMeditationKey((k) => k + 1)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Mi Sistema</h1>
        <p className="text-gray-500 text-sm mt-0.5">Trading Operating System (TOS) v1.0</p>
      </div>

      {/* Identidad y Objetivo */}
      <div className="card border border-blue-500/20 bg-blue-500/5">
        <p className="text-xs text-blue-400 uppercase tracking-wider font-semibold mb-2">Identidad</p>
        <p className="text-sm text-gray-200 leading-relaxed">
          Soy un trader disciplinado y rentable. Mi trabajo es ejecutar mi sistema, no tener la razón.
          Una operación exitosa es la que cumple todas mis reglas, incluso si termina en stop loss.
        </p>
        <p className="text-xs text-blue-400 uppercase tracking-wider font-semibold mt-4 mb-2">Objetivo</p>
        <p className="text-sm text-gray-200 leading-relaxed">
          Construir consistencia antes que rentabilidad. La rentabilidad será consecuencia del proceso.
        </p>
      </div>

      {/* Rutina Matutina — hábitos reales marcados como "pre-mercado", con check
          interactivo (antes era una lista de referencia estática). */}
      <PreMarketHabits />

      {/* Checklist Pre-Trade — embebido, es la única fuente de verdad (antes vivía
          también en /trading/checklist, que ahora redirige aquí). */}
      <PreTradeChecklist />

      {/* Protocolo Anti-FOMO */}
      <div className="card border border-orange-500/20 bg-orange-500/5">
        <p className="font-semibold text-white text-sm mb-1">🧊 Protocolo Anti-FOMO</p>
        <p className="text-xs text-gray-400 mb-4">
          Cuando sientas que &quot;se va el movimiento&quot;: detente, respira 60 segundos y responde la pregunta.
        </p>

        {!fomoStarted && (
          <button onClick={startFomoProtocol} className="btn-primary text-sm">
            Iniciar protocolo (60s)
          </button>
        )}

        {fomoStarted && !fomoDone && (
          <BreathingTimer
            key={fomoKey}
            durationSeconds={60}
            color="orange"
            size={180}
            autoStart
            onComplete={() => setFomoDone(true)}
          />
        )}

        {fomoDone && fomoAnswer === null && (
          <div className="space-y-3">
            <p className="text-sm text-gray-200 font-medium">¿Estoy siguiendo mi plan o mi emoción?</p>
            <div className="flex gap-3">
              <button onClick={() => setFomoAnswer('plan')} className="btn-secondary text-sm border border-green-500/30 text-green-400 hover:bg-green-500/10">
                Es mi plan
              </button>
              <button onClick={() => setFomoAnswer('emocion')} className="btn-secondary text-sm border border-red-500/30 text-red-400 hover:bg-red-500/10">
                Es mi emoción
              </button>
            </div>
          </div>
        )}

        {fomoAnswer && (
          <div className="flex items-start gap-3">
            <span className="text-2xl">{fomoAnswer === 'plan' ? '✅' : '🛑'}</span>
            <div>
              <p className={`text-sm font-semibold ${fomoAnswer === 'plan' ? 'text-green-400' : 'text-red-400'}`}>
                {fomoAnswer === 'plan' ? 'Puedes operar — sigue tu checklist.' : 'No operes. Es emoción, no plan.'}
              </p>
              <button onClick={restartFomoProtocol} className="text-xs text-gray-500 hover:text-gray-300 mt-1">
                Reiniciar protocolo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Meditación / Respiración */}
      <div className="card border border-teal-500/20 bg-teal-500/5">
        <p className="font-semibold text-white text-sm mb-1">🧘 Meditación / Respiración</p>
        <p className="text-xs text-gray-400 mb-4">
          Parte de tu rutina matutina (5–10 min). Respiración en caja: inhala, sostén, exhala, sostén — 4s cada fase.
        </p>

        <div className="flex gap-1.5 mb-5">
          {MEDITATION_PRESETS.map((p) => (
            <button
              key={p.seconds}
              onClick={() => changeMeditationPreset(p.seconds)}
              className={`text-xs py-1.5 px-3 rounded transition-colors ${
                meditationSeconds === p.seconds
                  ? 'bg-teal-600 text-white'
                  : 'bg-[#111] text-gray-500 hover:text-gray-300 border border-[#2a2a2a]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <BreathingTimer key={meditationKey} durationSeconds={meditationSeconds} color="teal" size={240} />
      </div>

      {/* Revisión Semanal */}
      <div className="card">
        <p className="font-semibold text-white text-sm mb-1">📈 Revisión Semanal</p>
        <p className="text-sm text-gray-400 mb-3">
          Mide el porcentaje de cumplimiento del sistema antes que las ganancias.
        </p>
        <Link href="/trading/resumen" className="btn-secondary text-sm inline-block">Ver Resumen Semanal →</Link>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Link href="/trading/diario" className="card hover:border-blue-500/30 transition-colors text-center py-4">
          <p className="text-sm font-medium text-gray-200">Diario</p>
        </Link>
        <Link href="/trading/calculadora" className="card hover:border-blue-500/30 transition-colors text-center py-4">
          <p className="text-sm font-medium text-gray-200">Calculadora</p>
        </Link>
        <Link href="/trading/estadisticas" className="card hover:border-blue-500/30 transition-colors text-center py-4">
          <p className="text-sm font-medium text-gray-200">Estadísticas</p>
        </Link>
      </div>
    </div>
  )
}
