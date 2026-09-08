'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDateTime } from '@/lib/utils'

interface CompanyLite { id: string; name: string; color: string; emoji: string }
interface MeetingListItem {
  id: string
  title: string
  date: string
  summary: string | null
  company: CompanyLite | null
  tasks: { id: string; done: boolean }[]
}

export default function ReunionesPage() {
  const router = useRouter()
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', companyId: '' })

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [meetingsRes, companiesRes] = await Promise.all([
        fetch('/api/meetings'),
        fetch('/api/companies'),
      ])
      if (meetingsRes.ok) setMeetings(await meetingsRes.json())
      if (companiesRes.ok) setCompanies(await companiesRes.json())
    } finally {
      setLoading(false)
    }
  }

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title || undefined, companyId: form.companyId || undefined }),
      })
      if (res.ok) {
        const meeting = await res.json()
        router.push(`/reuniones/${meeting.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold gradient-text tracking-tight">Reuniones</h1>
        <p className="text-gray-500 text-sm mt-0.5">Notas manuscritas — las tareas se extraen automáticamente con IA</p>
      </div>

      <form onSubmit={createMeeting} className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Título</label>
          <input
            className="input"
            placeholder="Reunión con..."
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="min-w-[160px]">
          <label className="label">Empresa (opcional)</label>
          <select
            className="input"
            value={form.companyId}
            onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
          >
            <option value="">Sin empresa</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={creating} className="btn-primary">
          {creating ? 'Creando…' : '+ Nueva reunión'}
        </button>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => <div key={i} className="h-32 bg-[var(--bg-elevated)] animate-pulse rounded-xl" />)}
        </div>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">Aún no tienes reuniones. Crea la primera arriba.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {meetings.map((m) => {
            const pending = m.tasks.filter((t) => !t.done).length
            return (
              <Link key={m.id} href={`/reuniones/${m.id}`} className="card block hover:-translate-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{m.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(m.date)}</p>
                  </div>
                  {m.company && (
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full border shrink-0"
                      style={{ borderColor: `${m.company.color}50`, color: m.company.color, backgroundColor: `${m.company.color}15` }}
                    >
                      {m.company.emoji} {m.company.name}
                    </span>
                  )}
                </div>
                {m.summary ? (
                  <p className="text-xs text-gray-400 mt-2 line-clamp-2">{m.summary}</p>
                ) : (
                  <p className="text-xs text-gray-600 mt-2 italic">Sin resumen todavía — extrae las tareas para generarlo</p>
                )}
                {m.tasks.length > 0 && (
                  <p className="text-[11px] text-cyan-300 mt-2">
                    ✓ {m.tasks.length - pending}/{m.tasks.length} tareas completadas
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
