'use client'

import { useEffect, useState } from 'react'

interface CronRun {
  id: string
  job: string
  startedAt: string
  finishedAt: string | null
  ok: boolean
  summary: unknown
  error: string | null
}

const JOB_LABELS: Record<string, string> = {
  'agent-check': 'Chequeo de agentes',
  morning: 'Recordatorio de la mañana',
  midday: 'Recordatorio del mediodía',
  evening: 'Recordatorio de la noche',
  'generate-recurring': 'Tareas recurrentes',
  'weekly-angles': 'Ángulos de contenido (lunes)',
  'auto-content': 'Contenido automático (domingo)',
  'news-watch': 'Noticias automáticas (diario)',
  'topic-research': 'Investigador de temas (diario)',
  'metrics-report': 'Analista de métricas (semanal)',
  'publish-due': 'Publicación programada',
}

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} días`
}

interface Props {
  /** Última vez que el monitor chequeó los agentes (el más reciente de todos). */
  lastAgentCheck: string | null
}

export function CronRunsPanel({ lastAgentCheck }: Props) {
  const [latest, setLatest] = useState<CronRun[]>([])
  const [failures, setFailures] = useState<CronRun[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/cron-runs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { latest: CronRun[]; failures: CronRun[] } | null) => {
        if (d) { setLatest(d.latest); setFailures(d.failures) }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const stale = lastAgentCheck ? Date.now() - new Date(lastAgentCheck).getTime() > 20 * 60000 : true

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-100">⚙️ Tareas automáticas</h2>
        <span className={`text-xs ${stale ? 'text-amber-300' : 'text-emerald-300'}`}>
          {lastAgentCheck
            ? `Monitor de agentes: último chequeo ${ago(lastAgentCheck)}${stale ? ' — ¡revisar!' : ''}`
            : 'Monitor de agentes: sin chequeos todavía'}
        </span>
      </div>

      {loaded && latest.length === 0 && (
        <p className="text-xs text-zinc-500">Aún no hay corridas registradas. Aparecerán cuando se ejecute la primera tarea.</p>
      )}

      <div className="divide-y divide-zinc-800">
        {latest.map((r) => (
          <div key={r.id} className="flex items-center gap-3 py-1.5 text-xs">
            <span className={r.ok ? 'text-emerald-400' : 'text-red-400'}>{r.ok ? '✓' : '✗'}</span>
            <span className="flex-1 text-zinc-200">{JOB_LABELS[r.job] ?? r.job}</span>
            <span className="text-zinc-500">{ago(r.startedAt)}</span>
          </div>
        ))}
      </div>

      {failures.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-medium text-red-300">Fallas de los últimos 7 días</p>
          {failures.map((f) => (
            <p key={f.id} className="text-xs text-zinc-400">
              <span className="text-zinc-300">{JOB_LABELS[f.job] ?? f.job}</span> · {ago(f.startedAt)} · {f.error ?? 'error'}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
