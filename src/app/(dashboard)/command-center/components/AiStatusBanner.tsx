'use client'

import { useEffect, useState } from 'react'

interface AiStatus { failing: boolean; kind: string | null; message: string | null; since: string | null }

// Aviso fijo cuando la IA no está funcionando (sin crédito, límite, clave inválida). Se quita solo cuando vuelve a responder.
export function AiStatusBanner() {
  const [st, setSt] = useState<AiStatus | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => fetch('/api/ceo/ai-status').then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setSt(d) }).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!st?.failing) return null
  const credits = st.kind === 'credits'
  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100 space-y-1">
      <p className="font-semibold">{credits ? '💳 La IA se quedó sin crédito' : '⚠️ La IA no está funcionando bien'}</p>
      <p className="text-red-200/90">{st.message}</p>
      <p className="text-xs text-red-200/60">
        Mientras tanto, regenerar y la tanda automática no van a funcionar (tus posts no se pierden).
        {st.since ? ` Desde ${new Date(st.since).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` : ''} El aviso se quita solo cuando vuelva a funcionar.
      </p>
      {credits && (
        <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="inline-block text-xs underline text-red-100">
          Abrir facturación de Anthropic ↗
        </a>
      )}
    </div>
  )
}
