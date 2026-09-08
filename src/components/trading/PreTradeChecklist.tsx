'use client'

import { useEffect, useState } from 'react'

interface ChecklistItems {
  personal: boolean[]
  analisis: boolean[]
  reglas: boolean[]
}

const ITEMS = {
  personal: [
    'Me siento emocionalmente estable',
    'Dormí bien (6+ horas de sueño)',
    'No estoy estresado por factores externos',
    'Estoy enfocado en el mercado, no en el dinero',
  ],
  analisis: [
    'Tendencia en 4H y 1H',
    'Altos y bajos de Londres',
    'Liquidez relevante',
    'Soportes/resistencias',
    'Order Blocks',
    'Confirmación en temporalidad de entrada',
  ],
  reglas: [
    'Mi riesgo está fijado en 0.5% (o el nivel definido) — no lo subo',
    'No he abierto ya una operación hoy (máximo 1 por día)',
    'No estoy entrando por FOMO — si siento urgencia, respiro 60s primero',
    'Tengo un setup claro según mi playbook — si no, no opero',
    'No he tenido 3 pérdidas consecutivas hoy',
  ],
}

const DEFAULT_ITEMS: ChecklistItems = {
  personal: [false, false, false, false],
  analisis: [false, false, false, false, false, false],
  reglas: [false, false, false, false, false],
}

export function PreTradeChecklist() {
  const [items, setItems] = useState<ChecklistItems>(DEFAULT_ITEMS)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [tradesToday, setTradesToday] = useState<number | null>(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadChecklist()
    fetch(`/api/trades?date=${today}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((trades) => setTradesToday(Array.isArray(trades) ? trades.length : 0))
      .catch(() => setTradesToday(null))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadChecklist() {
    const res = await fetch(`/api/checklist?date=${today}`, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const loaded = data.items as Partial<ChecklistItems> | undefined
      // Ignora checklists guardados con el esquema anterior (setup/riesgo) para no romper el render.
      if (loaded && Array.isArray(loaded.personal) && Array.isArray(loaded.analisis) && Array.isArray(loaded.reglas)) {
        setItems(loaded as ChecklistItems)
      }
    }
  }

  async function toggleItem(section: keyof ChecklistItems, index: number) {
    const newItems = {
      ...items,
      [section]: items[section].map((v, i) => (i === index ? !v : v)),
    }
    setItems(newItems)
    setSaving(true)
    await fetch('/api/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: newItems, date: today }),
    })
    setLastSaved(new Date())
    setSaving(false)
  }

  const totalItems = ITEMS.personal.length + ITEMS.analisis.length + ITEMS.reglas.length
  const completedItems =
    items.personal.filter(Boolean).length +
    items.analisis.filter(Boolean).length +
    items.reglas.filter(Boolean).length

  const personalComplete = items.personal.every(Boolean)
  const analisisComplete = items.analisis.every(Boolean)
  const reglasComplete = items.reglas.every(Boolean)
  const allComplete = personalComplete && analisisComplete && reglasComplete

  async function resetAll() {
    const newItems = DEFAULT_ITEMS
    setItems({ ...newItems })
    await fetch('/api/checklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: newItems, date: today }),
    })
  }

  const readinessColor = allComplete
    ? 'text-green-400 border-green-500/30 bg-green-500/10'
    : completedItems >= totalItems * 0.7
    ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
    : 'text-red-400 border-red-500/30 bg-red-500/10'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-white text-sm">✅ Checklist Pre-Trade</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Completa antes de abrir cualquier posición • Se resetea cada día
          </p>
        </div>
        <button onClick={resetAll} className="btn-secondary text-xs">
          Resetear
        </button>
      </div>

      {/* Overall Progress */}
      <div className={`card border ${readinessColor}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Preparación para el mercado</span>
          <span className="text-lg font-bold">{completedItems}/{totalItems}</span>
        </div>
        <div className="w-full bg-[#111] rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              allComplete ? 'bg-green-500' : completedItems >= totalItems * 0.7 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${(completedItems / totalItems) * 100}%` }}
          />
        </div>
        <p className="text-xs mt-2">
          {allComplete
            ? '✅ Listo para operar'
            : completedItems >= totalItems * 0.7
            ? '⚠️ Casi listo — revisa los ítems pendientes'
            : '🛑 No estás listo para operar aún'}
        </p>
        {saving && <p className="text-xs text-cyan-300 mt-1">Guardando...</p>}
        {lastSaved && !saving && (
          <p className="text-xs text-gray-600 mt-1">
            Guardado {lastSaved.toLocaleTimeString('es-CO')}
          </p>
        )}
      </div>

      {/* Section: Condición Personal */}
      <ChecklistSection
        title="1. Condición Personal"
        subtitle="Tu estado mental y emocional"
        emoji="🧠"
        items={ITEMS.personal}
        checked={items.personal}
        complete={personalComplete}
        onToggle={(i) => toggleItem('personal', i)}
      />

      {/* Section: Checklist de Análisis */}
      <ChecklistSection
        title="2. Checklist de Análisis"
        subtitle="Confluencia técnica (ICT/SMC) — si falta una condición, no operar"
        emoji="📊"
        items={ITEMS.analisis}
        checked={items.analisis}
        complete={analisisComplete}
        onToggle={(i) => toggleItem('analisis', i)}
      />

      {/* Section: Reglas del Sistema */}
      <div>
        <ChecklistSection
          title="3. Reglas del Sistema"
          subtitle="Disciplina de riesgo y ejecución"
          emoji="🛡️"
          items={ITEMS.reglas}
          checked={items.reglas}
          complete={reglasComplete}
          onToggle={(i) => toggleItem('reglas', i)}
        />
        {tradesToday !== null && (
          <p className={`text-xs mt-2 ${tradesToday >= 1 ? 'text-yellow-400' : 'text-gray-500'}`}>
            {tradesToday >= 1
              ? `⚠️ Ya registraste ${tradesToday} operación${tradesToday > 1 ? 'es' : ''} hoy — el sistema pide máximo 1/día.`
              : 'Operaciones hoy: 0/1'}
          </p>
        )}
      </div>

      {/* Final Decision */}
      {allComplete && (
        <div className="card border border-green-500/30 bg-green-500/5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-semibold text-green-400">¡Puedes operar!</p>
              <p className="text-sm text-gray-400 mt-0.5">
                Todos los criterios están verificados. Recuerda: sigue el plan, gestiona el riesgo.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChecklistSection({
  title, subtitle, emoji, items, checked, complete, onToggle,
}: {
  title: string
  subtitle: string
  emoji: string
  items: string[]
  checked: boolean[]
  complete: boolean
  onToggle: (index: number) => void
}) {
  const count = checked.filter(Boolean).length
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <div>
            <p className="font-semibold text-white text-sm">{title}</p>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{count}/{items.length}</span>
          {complete && <span className="text-green-400 text-sm">✓</span>}
        </div>
      </div>
      <div className="space-y-2.5">
        {items.map((item, i) => (
          <label
            key={i}
            className="flex items-start gap-3 cursor-pointer group"
            onClick={() => onToggle(i)}
          >
            <div className={`mt-0.5 w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              checked[i]
                ? 'bg-cyan-500 border-cyan-500'
                : 'border-[#3a3a3a] group-hover:border-cyan-500/50'
            }`}>
              {checked[i] && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-sm transition-colors ${
              checked[i] ? 'text-gray-500 line-through' : 'text-gray-300 group-hover:text-white'
            }`}>
              {item}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
