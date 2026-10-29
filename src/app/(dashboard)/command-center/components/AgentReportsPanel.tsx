'use client'

import { useEffect, useState } from 'react'

interface Report {
  id: string
  kind: string
  title: string
  createdAt: string
  content: Record<string, unknown>
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

// Lo último que dejaron los agentes programados para esta empresa: resultados y temas nuevos.
export function AgentReportsPanel({ companyId }: { companyId: string }) {
  const [reports, setReports] = useState<Report[] | null>(null)

  useEffect(() => {
    setReports(null)
    fetch(`/api/ceo/reports?companyId=${companyId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setReports)
      .catch(() => setReports([]))
  }, [companyId])

  const metrics = reports?.find((r) => r.kind === 'metrics')
  const topics = reports?.find((r) => r.kind === 'topics')
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/30">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-200">
        📈 Resultados y temas de los agentes
      </summary>
      <div className="grid gap-4 p-4 pt-1 md:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Analista de métricas{metrics ? ` · ${fmt(metrics.createdAt)}` : ''}</p>
          {metrics ? (
            <>
              <p className="text-sm text-zinc-200">{String(metrics.content.summary ?? '')}</p>
              {list(metrics.content.worked).map((w, i) => <p key={`w${i}`} className="text-xs text-emerald-300">✅ {w}</p>)}
              {list(metrics.content.change).map((w, i) => <p key={`c${i}`} className="text-xs text-amber-300">🔧 {w}</p>)}
            </>
          ) : (
            <p className="text-xs text-zinc-500">Aún no hay informe. Cada sábado se genera uno cuando hay al menos 3 posts publicados con números (agrégalos con "📊 Agregar números" en los publicados).</p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Investigador de temas{topics ? ` · ${fmt(topics.createdAt)}` : ''}</p>
          {topics ? (
            (Array.isArray(topics.content.topics) ? (topics.content.topics as { angle: string; why: string; source?: string }[]) : []).map((t, i) => (
              <p key={i} className="text-xs text-zinc-300">
                💡 <span className="font-medium">{t.angle}</span> — {t.why}
                {t.source && /^https?:\/\//.test(t.source) && <> <a href={t.source} target="_blank" rel="noopener noreferrer" className="text-indigo-300">fuente ↗</a></>}
              </p>
            ))
          ) : (
            <p className="text-xs text-zinc-500">Aún no hay temas nuevos. El investigador corre cada día y las ideas se usan solas al generar la semana.</p>
          )}
        </div>
      </div>
    </details>
  )
}
