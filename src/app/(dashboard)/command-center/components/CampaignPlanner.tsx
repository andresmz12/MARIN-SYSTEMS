'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, MarketingCampaign } from '../types'

interface Props {
  companies: CEOCompany[]
}

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' })
}

export function CampaignPlanner({ companies }: Props) {
  const { showToast } = useToast()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [month, setMonth] = useState(currentMonthKey())
  const [objective, setObjective] = useState('')
  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setCampaign(null)
    try {
      const res = await fetch(`/api/ceo/campaigns?companyId=${companyId}&month=${month}`)
      if (res.ok) {
        const data: MarketingCampaign | null = await res.json()
        setCampaign(data)
        if (data?.objective) setObjective(data.objective)
      }
    } catch {
      showToast('Error al cargar el plan', 'error')
    } finally {
      setLoading(false)
    }
  }, [companyId, month, showToast])

  useEffect(() => { load() }, [load])

  async function generate() {
    if (!companyId || !objective.trim()) {
      showToast('Escribe el objetivo del mes', 'error')
      return
    }
    setGenerating(true)
    try {
      const res = await fetch('/api/ceo/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, month, objective }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? 'Error')
      }
      setCampaign(await res.json())
      showToast('🎯 Plan de campaña generado', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al generar el plan', 'error')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        >
          {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Objective + generate */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block">
          Objetivo de {monthLabel(month)}
        </label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Ej: conseguir 30 leads calificados de ITIN y posicionar la marca antes de la temporada de taxes"
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600 resize-none"
        />
        <button onClick={generate} disabled={generating || !objective.trim()}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Diseñando el plan…
            </>
          ) : campaign ? '🔄 Regenerar plan' : '🎯 Generar plan de campaña'}
        </button>
      </div>

      {/* Plan */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-zinc-800/60 animate-pulse" />)}
        </div>
      ) : campaign ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Big idea */}
          {campaign.bigIdea && (
            <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/30 p-4">
              <p className="text-xs text-indigo-300/70 mb-1 uppercase tracking-wide font-semibold">💡 Gran idea del mes</p>
              <p className="text-sm text-indigo-100 leading-relaxed">{campaign.bigIdea}</p>
            </div>
          )}

          {/* Pillars */}
          {campaign.pillars.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide font-semibold">Pilares</p>
              <div className="flex flex-wrap gap-2">
                {campaign.pillars.map((p) => (
                  <span key={p} className="px-3 py-1 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-200 border border-zinc-700">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Weeks */}
          <div className="grid gap-3 sm:grid-cols-2">
            {campaign.weeks.map((w) => (
              <div key={w.week} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">{w.week}</span>
                  <p className="text-sm font-semibold text-white">{w.theme}</p>
                </div>
                {w.focus && <p className="text-xs text-zinc-400 leading-relaxed">{w.focus}</p>}
                {w.contentIdeas.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {w.contentIdeas.map((idea, i) => (
                      <li key={i} className="text-xs text-zinc-300 flex gap-1.5">
                        <span className="text-indigo-400">▸</span> {idea}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* KPIs */}
          {campaign.kpis && campaign.kpis.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide font-semibold">📊 KPIs</p>
              <div className="flex flex-wrap gap-2">
                {campaign.kpis.map((k) => (
                  <span key={k} className="px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">{k}</span>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
          Escribe el objetivo del mes y genera un plan de campaña con pilares, semanas y KPIs.
        </div>
      )}
    </div>
  )
}
