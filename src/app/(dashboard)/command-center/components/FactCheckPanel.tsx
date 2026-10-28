'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { GeneratedPost } from '../types'

const VERDICT = {
  ok: { label: '✅ Datos verificados', cls: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200' },
  revisar: { label: '⚠️ Revisa estos datos antes de aprobar', cls: 'border-amber-500/40 bg-amber-500/5 text-amber-200' },
  error: { label: '⛔ Hay datos incorrectos: corrige antes de aprobar', cls: 'border-red-500/40 bg-red-500/5 text-red-200' },
} as const

const ITEM_ICON: Record<string, string> = { confirmado: '✅', dudoso: '⚠️', incorrecto: '⛔', sin_fuente: '❔' }

// Resultado del agente verificador de datos de un post, con botón para (re)verificar.
export function FactCheckPanel({ post, onDone }: { post: GeneratedPost; onDone: () => void }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const fc = post.factCheck

  async function run() {
    setBusy(true)
    try {
      const res = await fetch(`/api/ceo/content/${post.id}/fact-check`, { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'No se pudo verificar')
      onDone()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo verificar', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!fc) {
    return (
      <button
        onClick={run}
        disabled={busy}
        className="text-xs text-zinc-200 border border-zinc-700 rounded-md px-2.5 py-1 hover:border-zinc-500 disabled:opacity-40"
      >
        {busy ? 'Verificando… (puede tardar un minuto)' : '🔎 Verificar datos'}
      </button>
    )
  }
  const v = VERDICT[fc.verdict] ?? VERDICT.revisar
  return (
    <div className={`rounded-lg border p-2.5 space-y-1.5 ${v.cls}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{v.label}</p>
        <button onClick={run} disabled={busy} className="text-[11px] underline opacity-80 hover:opacity-100 disabled:opacity-40">
          {busy ? 'Verificando…' : 'Verificar de nuevo'}
        </button>
      </div>
      {fc.summary && <p className="text-xs text-zinc-300">{fc.summary}</p>}
      <ul className="space-y-1">
        {fc.items.map((it, i) => (
          <li key={i} className="text-xs text-zinc-300">
            {ITEM_ICON[it.status] ?? '•'} <span className="font-medium">{it.claim}</span>
            {it.note && <span className="text-zinc-400"> — {it.note}</span>}
            {it.source && /^https?:\/\//.test(it.source) && (
              <> <a href={it.source} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200">fuente ↗</a></>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
