'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const RUTINA = [
  { time: '7:00', label: 'Despertar' },
  { time: '7:00 – 7:30', label: 'Aseo personal e hidratación' },
  { time: '7:30 – 7:40', label: 'Paseo con Teddy' },
  { time: '7:40 – 7:50', label: 'Respiración / meditación (5–10 min)' },
  { time: '8:00 – 8:20', label: 'Calendario económico y análisis' },
  { time: '8:20 – 8:30', label: 'Checklist' },
]

const REGLAS = [
  'Riesgo fijo 0.5% (o el definido)',
  'Máximo una operación por día',
  'Nunca aumentar riesgo para recuperar',
  'Nunca entrar por FOMO',
  'Si no hay setup, no hay trade',
]

type FomoAnswer = 'plan' | 'emocion' | null

export default function MiSistemaPage() {
  const [tradesToday, setTradesToday] = useState<number | null>(null)
  const [fomoRunning, setFomoRunning] = useState(false)
  const [fomoSecondsLeft, setFomoSecondsLeft] = useState(60)
  const [fomoAnswer, setFomoAnswer] = useState<FomoAnswer>(null)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    fetch(`/api/trades?date=${today}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((trades) => setTradesToday(Array.isArray(trades) ? trades.length : 0))
      .catch(() => setTradesToday(null))
  }, [])

  useEffect(() => {
    if (!fomoRunning) return
    if (fomoSecondsLeft <= 0) { setFomoRunning(false); return }
    const t = setTimeout(() => setFomoSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [fomoRunning, fomoSecondsLeft])

  function startFomoProtocol() {
    setFomoAnswer(null)
    setFomoSecondsLeft(60)
    setFomoRunning(true)
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

      {/* Rutina Matutina */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-white text-sm">🌅 Rutina Matutina</p>
            <p className="text-xs text-gray-500">Cada hábito diario está en tu módulo de Hábitos</p>
          </div>
          <Link href="/habitos" className="text-xs text-blue-400 hover:text-blue-300">Ver hábitos →</Link>
        </div>
        <div className="space-y-2">
          {RUTINA.map((r) => (
            <div key={r.label} className="flex items-center gap-3 text-sm">
              <span className="text-xs text-gray-500 w-24 flex-shrink-0 font-mono">{r.time}</span>
              <span className="text-gray-300">{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reglas del Sistema */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-white text-sm">🛡️ Reglas del Sistema</p>
            <p className="text-xs text-gray-500">Disciplina de riesgo y ejecución</p>
          </div>
          <Link href="/trading/checklist" className="text-xs text-blue-400 hover:text-blue-300">Ir al checklist →</Link>
        </div>
        <ul className="space-y-2">
          {REGLAS.map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-blue-400 mt-0.5">–</span>
              {r}
            </li>
          ))}
        </ul>
        {tradesToday !== null && (
          <p className={`text-xs mt-3 pt-3 border-t border-[#2a2a2a] ${tradesToday >= 1 ? 'text-yellow-400' : 'text-gray-500'}`}>
            {tradesToday >= 1
              ? `⚠️ Ya registraste ${tradesToday} operación${tradesToday > 1 ? 'es' : ''} hoy — máximo permitido: 1/día.`
              : 'Operaciones hoy: 0/1'}
          </p>
        )}
      </div>

      {/* Protocolo Anti-FOMO */}
      <div className="card border border-orange-500/20 bg-orange-500/5">
        <p className="font-semibold text-white text-sm mb-1">🧊 Protocolo Anti-FOMO</p>
        <p className="text-xs text-gray-400 mb-4">
          Cuando sientas que &quot;se va el movimiento&quot;: detente, respira 60 segundos y responde la pregunta.
        </p>

        {!fomoRunning && fomoSecondsLeft === 60 && fomoAnswer === null && (
          <button onClick={startFomoProtocol} className="btn-primary text-sm">
            Iniciar protocolo (60s)
          </button>
        )}

        {fomoRunning && (
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full border-4 border-orange-500/30 border-t-orange-400 flex items-center justify-center text-xl font-bold text-orange-300 animate-pulse">
              {fomoSecondsLeft}
            </div>
            <p className="text-sm text-gray-300">Respira. No operes todavía.</p>
          </div>
        )}

        {!fomoRunning && fomoSecondsLeft === 0 && fomoAnswer === null && (
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
              <button
                onClick={() => { setFomoAnswer(null); setFomoSecondsLeft(60) }}
                className="text-xs text-gray-500 hover:text-gray-300 mt-1"
              >
                Reiniciar protocolo
              </button>
            </div>
          </div>
        )}
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
        <Link href="/trading/checklist" className="card hover:border-blue-500/30 transition-colors text-center py-4">
          <p className="text-sm font-medium text-gray-200">Checklist Pre-Trade</p>
        </Link>
        <Link href="/trading/diario" className="card hover:border-blue-500/30 transition-colors text-center py-4">
          <p className="text-sm font-medium text-gray-200">Diario</p>
        </Link>
        <Link href="/trading/calculadora" className="card hover:border-blue-500/30 transition-colors text-center py-4">
          <p className="text-sm font-medium text-gray-200">Calculadora</p>
        </Link>
      </div>
    </div>
  )
}
