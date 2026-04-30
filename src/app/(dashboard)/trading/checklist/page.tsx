'use client'

import { useEffect, useState } from 'react'

interface ChecklistItems {
  personal: boolean[]
  setup: boolean[]
  riesgo: boolean[]
}

const ITEMS = {
  personal: [
    'Me siento emocionalmente estable',
    'Dormí bien (6+ horas de sueño)',
    'No estoy estresado por factores externos',
    'Estoy enfocado en el mercado, no en el dinero',
  ],
  setup: [
    'La tendencia principal en H4/D1 está clara',
    'El precio está en una zona de valor (S/R, FVG)',
    'Tengo confirmación en M15/H1',
    'El setup coincide con mi playbook de estrategias',
  ],
  riesgo: [
    'El riesgo no supera el 1-2% del capital',
    'El Stop Loss está en un nivel técnico válido',
    'No he tenido más de 2 pérdidas consecutivas hoy',
  ],
}

const DEFAULT_ITEMS: ChecklistItems = {
  personal: [false, false, false, false],
  setup: [false, false, false, false],
  riesgo: [false, false, false],
}

export default function ChecklistPage() {
  const [items, setItems] = useState<ChecklistItems>(DEFAULT_ITEMS)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadChecklist()
  }, [])

  async function loadChecklist() {
    const res = await fetch(`/api/checklist?date=${today}`)
    if (res.ok) {
      const data = await res.json()
      if (data.items) setItems(data.items as ChecklistItems)
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

  const totalItems = ITEMS.personal.length + ITEMS.setup.length + ITEMS.riesgo.length
  const completedItems =
    items.personal.filter(Boolean).length +
    items.setup.filter(Boolean).length +
    items.riesgo.filter(Boolean).length

  const personalComplete = items.personal.every(Boolean)
  const setupComplete = items.setup.every(Boolean)
  const riesgoComplete = items.riesgo.every(Boolean)
  const allComplete = personalComplete && setupComplete && riesgoComplete

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
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Checklist Pre-Trade</h1>
          <p className="text-gray-500 text-sm mt-0.5">
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
        {saving && <p className="text-xs text-blue-400 mt-1">Guardando...</p>}
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

      {/* Section: Setup Válido */}
      <ChecklistSection
        title="2. Setup Válido"
        subtitle="Confluencia técnica del mercado"
        emoji="📊"
        items={ITEMS.setup}
        checked={items.setup}
        complete={setupComplete}
        onToggle={(i) => toggleItem('setup', i)}
      />

      {/* Section: Gestión de Riesgo */}
      <ChecklistSection
        title="3. Gestión de Riesgo"
        subtitle="Parámetros de riesgo controlados"
        emoji="🛡️"
        items={ITEMS.riesgo}
        checked={items.riesgo}
        complete={riesgoComplete}
        onToggle={(i) => toggleItem('riesgo', i)}
      />

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
                ? 'bg-blue-600 border-blue-600'
                : 'border-[#3a3a3a] group-hover:border-blue-600/50'
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
