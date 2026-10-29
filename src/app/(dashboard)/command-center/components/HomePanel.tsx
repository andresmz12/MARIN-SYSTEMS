'use client'

import { useCallback, useEffect, useState } from 'react'
import { PLATFORM_CONFIG } from '../utils'

interface Row {
  id: string
  topic: string
  platforms: string[]
  status: string
  scheduledDate: string | null
  publishedAt: string | null
  externalUrl: string | null
  imageUrl: string | null
  companyId: string
  company: { name: string; emoji: string }
}
interface Home {
  pending: { total: number; missingImages: number; items: Row[] }
  failed: { id: string; topic: string; platform: string; error: string | null; company: { name: string; emoji: string } }[]
  today: Row[]
  upcoming: Row[]
  recent: Row[]
  runs: { job: string; startedAt: string; finishedAt: string | null; ok: boolean; error: string | null }[]
}

const JOB_LABEL: Record<string, string> = {
  'auto-content': 'Tanda semanal de posts',
  'news-watch': 'Búsqueda de noticias',
  'publish-due': 'Publicación automática',
  metrics: 'Métricas',
  'topic-research': 'Investigación de temas',
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'sin fecha'

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`
  return `hace ${Math.round(m / 1440)} d`
}

const nets = (p: string[]) => p.map((x) => PLATFORM_CONFIG[x]?.emoji ?? '•').join(' ')

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'warn' | 'bad' }) {
  const border = tone === 'bad' ? 'border-red-500/40' : tone === 'warn' ? 'border-amber-500/40' : 'border-zinc-800'
  return (
    <section className={`rounded-xl border ${border} bg-zinc-900/50 p-4 space-y-2`}>
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {children}
    </section>
  )
}

// Pantalla de inicio: lo importante del día en un vistazo.
export function HomePanel({ onGoCompany }: { onGoCompany: (companyId?: string) => void }) {
  const [data, setData] = useState<Home | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/ceo/home')
      if (!res.ok) throw new Error()
      setData(await res.json())
      setError(false)
    } catch { setError(true) }
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <p className="text-sm text-red-300">No se pudo cargar el resumen. <button onClick={load} className="underline">Reintentar</button></p>
  if (!data) return <div className="h-40 rounded-xl bg-zinc-800/60 animate-pulse" />

  const attention = data.pending.total > 0 || data.failed.length > 0

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Card title={attention ? '👀 Necesita tu atención' : '✅ Todo al día'} tone={data.failed.length ? 'bad' : data.pending.total ? 'warn' : undefined}>
          {!attention && <p className="text-sm text-zinc-400">No hay posts por aprobar ni publicaciones con error.</p>}
          {data.pending.total > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
              <span><b className="text-amber-300">{data.pending.total}</b> {data.pending.total === 1 ? 'post por aprobar' : 'posts por aprobar'}</span>
              {data.pending.missingImages > 0 && <span className="text-amber-200">· {data.pending.missingImages} sin imagen</span>}
              <button onClick={() => onGoCompany(data.pending.items[0]?.companyId)} className="ml-auto rounded-lg border border-indigo-500/40 px-3 py-1 text-xs text-indigo-200 hover:bg-indigo-500/10">Ir a revisarlos →</button>
            </div>
          )}
          {data.failed.map((f) => (
            <p key={f.id} className="text-xs text-red-300">❌ {PLATFORM_CONFIG[f.platform]?.label ?? f.platform}: {f.topic}{f.error ? ` — ${f.error}` : ''}</p>
          ))}
        </Card>
      </div>

      <Card title="📅 Hoy">
        {data.today.length === 0 ? <p className="text-sm text-zinc-500">Nada programado para hoy.</p> : (
          <ul className="space-y-1.5">
            {data.today.map((r) => (
              <li key={r.id} className="text-sm text-zinc-200">
                <span className={r.status === 'published' ? 'text-emerald-300' : r.status === 'failed' ? 'text-red-300' : 'text-sky-300'}>
                  {r.status === 'published' ? '✓ Publicado' : r.status === 'failed' ? '✗ Falló' : '⏰ Programado'}
                </span>{' '}
                {nets(r.platforms)} {r.topic}
                <span className="block text-xs text-zinc-500">{fmt(r.publishedAt ?? r.scheduledDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="⏭ Próximas publicaciones">
        {data.upcoming.length === 0 ? <p className="text-sm text-zinc-500">No hay posts programados.</p> : (
          <ul className="space-y-1.5">
            {data.upcoming.map((r) => (
              <li key={r.id} className="text-sm text-zinc-200">
                {nets(r.platforms)} {r.topic}
                <span className="block text-xs text-zinc-500">{fmt(r.scheduledDate)}{r.imageUrl ? '' : ' · ⚠️ sin imagen'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="🚀 Últimos publicados">
        {data.recent.length === 0 ? <p className="text-sm text-zinc-500">Todavía no hay publicaciones.</p> : (
          <ul className="space-y-1.5">
            {data.recent.map((r) => (
              <li key={r.id} className="text-sm text-zinc-200">
                {nets(r.platforms)} {r.topic}
                <span className="block text-xs text-zinc-500">
                  {fmt(r.publishedAt)}
                  {r.externalUrl && <> · <a href={r.externalUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">ver ↗</a></>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="🤖 Piloto automático">
        {data.runs.length === 0 ? <p className="text-sm text-zinc-500">Aún no hay corridas registradas.</p> : (
          <ul className="space-y-1.5">
            {data.runs.map((r) => (
              <li key={r.job} className="text-sm text-zinc-200">
                <span className={r.finishedAt ? (r.ok ? 'text-emerald-300' : 'text-red-300') : 'text-amber-300'}>{r.finishedAt ? (r.ok ? '✓' : '✗') : '…'}</span>{' '}
                {JOB_LABEL[r.job] ?? r.job}
                <span className="text-xs text-zinc-500"> · {ago(r.startedAt)}</span>
                {r.error && !r.ok && <span className="block text-xs text-red-300/80 truncate">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
