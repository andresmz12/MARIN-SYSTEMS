'use client'

import type { GeneratedPost } from '../types'
import { PLATFORM_CONFIG } from '../utils'

interface Props {
  posts: GeneratedPost[]
  onRetry: (id: string) => void
  busyId: string | null
  canPublish: boolean
  publishPlatforms: string[]
}

const STATE: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Programado', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-200' },
  publishing: { label: 'Publicando…', cls: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200' },
  published: { label: 'Publicado', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' },
  failed: { label: 'Falló', cls: 'border-red-500/50 bg-red-500/10 text-red-200' },
}

// Resumen "una fila por contenido, una pastilla por red": qué salió, qué está programado y qué falló.
export function PublishBoard({ posts, onRetry, busyId, canPublish, publishPlatforms }: Props) {
  const live = posts.filter((p) => STATE[p.status])
  if (live.length === 0) return null
  const groups = new Map<string, GeneratedPost[]>()
  for (const p of live) {
    const k = p.groupId ?? p.id
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const rows = Array.from(groups.values()).sort((a, b) => (a[0].scheduledDate ?? '').localeCompare(b[0].scheduledDate ?? ''))

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-zinc-200">📡 Estado por red</h3>
      <div className="space-y-2">
        {rows.map((members) => {
          const first = members[0]
          const date = first.scheduledDate
            ? new Date(first.scheduledDate).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })
            : 'sin fecha'
          return (
            <div key={first.groupId ?? first.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm text-zinc-200 truncate max-w-full">{first.topic}</span>
                <span className="text-xs text-zinc-500">{date}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const st = STATE[m.status]
                  const failed = m.status === 'failed'
                  const retryable = failed && canPublish && publishPlatforms.includes(m.platform) && !!m.imageUrl
                  return (
                    <span key={m.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${st.cls}`} title={m.publishError ?? undefined}>
                      <span>{PLATFORM_CONFIG[m.platform]?.emoji}</span>
                      <span>{PLATFORM_CONFIG[m.platform]?.label ?? m.platform}: {st.label}</span>
                      {m.status === 'published' && m.externalUrl && (
                        <a href={m.externalUrl} target="_blank" rel="noopener noreferrer" className="underline">ver ↗</a>
                      )}
                      {retryable && (
                        <button disabled={busyId === m.id} onClick={() => onRetry(m.id)} className="underline disabled:opacity-40">
                          {busyId === m.id ? 'Enviando…' : 'Reintentar solo esta'}
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
              {members.filter((m) => m.status === 'failed' && m.publishError).map((m) => (
                <p key={m.id} className="text-xs text-red-300/80">{PLATFORM_CONFIG[m.platform]?.label}: {m.publishError}</p>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
