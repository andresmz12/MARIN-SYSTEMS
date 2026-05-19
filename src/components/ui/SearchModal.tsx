'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface EventResult {
  id: string
  title: string
  date: string
  time: string | null
  type: string
}

interface CompanyResult {
  id: string
  name: string
  emoji: string
  status: string
  industry: string | null
}

interface JournalResult {
  id: string
  date: string
  mood: string
  content: string
}

interface HabitResult {
  id: string
  name: string
  emoji: string
  category: string
}

interface SearchResults {
  events: EventResult[]
  companies: CompanyResult[]
  journal: JournalResult[]
  habits: HabitResult[]
}

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalResults = results
    ? results.events.length + results.companies.length + results.journal.length + results.habits.length
    : 0

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data)
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const navigate = (path: string) => {
    router.push(path)
    onClose()
  }

  if (!open) return null

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })

  const truncate = (text: string, len = 80) =>
    text.length > len ? text.slice(0, len) + '...' : text

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden"
        style={{ background: '#111', border: '1px solid #2a2a2a' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#2a2a2a' }}>
          <span className="text-gray-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar eventos, empresas, journal, hábitos..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-gray-100 placeholder-gray-500 text-sm"
          />
          {loading && (
            <span className="text-gray-500 text-xs animate-pulse">Buscando...</span>
          )}
          <kbd className="hidden sm:inline text-gray-600 text-xs border rounded px-1" style={{ borderColor: '#2a2a2a' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query && (
            <p className="text-gray-600 text-sm text-center py-8">Escribe para buscar</p>
          )}

          {query && !loading && results && totalResults === 0 && (
            <p className="text-gray-600 text-sm text-center py-8">Sin resultados para &quot;{query}&quot;</p>
          )}

          {results && results.events.length > 0 && (
            <Section label="Eventos" icon="📅">
              {results.events.map(e => (
                <ResultRow
                  key={e.id}
                  onClick={() => navigate('/agenda')}
                  primary={e.title}
                  secondary={`${formatDate(e.date)}${e.time ? ' · ' + e.time : ''} · ${e.type}`}
                />
              ))}
            </Section>
          )}

          {results && results.companies.length > 0 && (
            <Section label="Empresas" icon="🏢">
              {results.companies.map(c => (
                <ResultRow
                  key={c.id}
                  onClick={() => navigate(`/empresas/${c.id}`)}
                  primary={`${c.emoji} ${c.name}`}
                  secondary={[c.industry, c.status].filter(Boolean).join(' · ')}
                />
              ))}
            </Section>
          )}

          {results && results.journal.length > 0 && (
            <Section label="Journal" icon="📓">
              {results.journal.map(j => (
                <ResultRow
                  key={j.id}
                  onClick={() => navigate('/journal')}
                  primary={formatDate(j.date)}
                  secondary={truncate(j.content)}
                />
              ))}
            </Section>
          )}

          {results && results.habits.length > 0 && (
            <Section label="Hábitos" icon="✅">
              {results.habits.map(h => (
                <ResultRow
                  key={h.id}
                  onClick={() => navigate('/habitos')}
                  primary={`${h.emoji} ${h.name}`}
                  secondary={h.category}
                />
              ))}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t flex gap-4 text-gray-600 text-xs" style={{ borderColor: '#2a2a2a' }}>
          <span><kbd className="border rounded px-1 mr-1" style={{ borderColor: '#2a2a2a' }}>↵</kbd>Abrir</span>
          <span><kbd className="border rounded px-1 mr-1" style={{ borderColor: '#2a2a2a' }}>ESC</kbd>Cerrar</span>
        </div>
      </div>
    </div>
  )
}

function Section({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"
        style={{ borderBottom: '1px solid #1a1a1a' }}>
        <span>{icon}</span> {label}
      </div>
      {children}
    </div>
  )
}

function ResultRow({ primary, secondary, onClick }: { primary: string; secondary: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 hover:bg-[#1a1a1a] transition-colors flex flex-col gap-0.5"
    >
      <span className="text-gray-100 text-sm">{primary}</span>
      {secondary && <span className="text-gray-500 text-xs">{secondary}</span>}
    </button>
  )
}
