'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany } from './types'
import { CompanyManager } from './components/CompanyManager'
import { ContentReviewQueue } from './components/ContentReviewQueue'
import { KnowledgeLibrary } from './components/KnowledgeLibrary'
import { ContentCalendar } from './components/ContentCalendar'

const MANAGE = '__manage__'
const LIBRARY = '__library__'
const CALENDAR = '__calendar__'

export default function CommandCenterPage() {
  const { showToast } = useToast()
  const [companies, setCompanies] = useState<CEOCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<string>('')

  const loadCompanies = useCallback(async () => {
    try {
      const res = await fetch('/api/ceo/companies')
      if (res.ok) setCompanies(await res.json())
    } catch {
      showToast('Error al cargar empresas', 'error')
    }
    setLoading(false)
  }, [showToast])

  useEffect(() => { loadCompanies() }, [loadCompanies])

  const active = companies.filter((c) => c.isActive)
  const current = tab === MANAGE || tab === LIBRARY || tab === CALENDAR ? null : (active.find((c) => c.id === tab) ?? active[0] ?? null)
  const showLibrary = tab === LIBRARY
  const showCalendar = tab === CALENDAR
  const showManage = tab === MANAGE || (!loading && active.length === 0)

  if (loading) {
    return <div className="h-40 rounded-xl bg-zinc-800/60 animate-pulse" />
  }

  return (
    <div className="space-y-5 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-white">🎯 Command Center</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Elige una empresa para ver y aprobar su contenido.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-3">
        {active.map((c) => {
          const on = !showManage && !showLibrary && !showCalendar && current?.id === c.id
          return (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                on ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {c.emoji} {c.name}
            </button>
          )
        })}
        <button
          onClick={() => setTab(CALENDAR)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
            showCalendar ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          📅 Calendario
        </button>
        <button
          onClick={() => setTab(LIBRARY)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
            showLibrary ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          📚 Biblioteca
        </button>
        <button
          onClick={() => setTab(MANAGE)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
            showManage ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          🏢 Empresas
        </button>
      </div>

      {showCalendar && active.length > 0 ? (
        <ContentCalendar companies={active} />
      ) : showLibrary ? (
        <KnowledgeLibrary companies={active} />
      ) : showManage ? (
        <CompanyManager companies={companies} onChanged={loadCompanies} />
      ) : (
        current && <ContentReviewQueue key={current.id} company={current} onOpenCompanies={() => setTab(MANAGE)} />
      )}
    </div>
  )
}
