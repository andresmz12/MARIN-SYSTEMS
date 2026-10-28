'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentStatus, OfficeAgent, OfficeDepartment } from '@/lib/office'
import { colombiaMinutes } from '@/lib/office'

// Three.js solo existe en el navegador: se carga aparte para no pesar en el resto de la app.
const OfficeScene = dynamic(() => import('./OfficeScene').then((m) => m.OfficeScene), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-zinc-500">Cargando la oficina…</div>,
})

const DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const REFRESH_MS = 60_000

const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
const ago = (iso: string | null, now: number) => {
  if (!iso) return null
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return `hace ${Math.round(min / 1440)} días`
}

function scheduledNow(a: OfficeAgent, day: number, minutes: number) {
  return a.slots.some((s) => (s.day === null || s.day === day) && minutes >= s.from && minutes < s.to)
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  work: '● Trabajando',
  sleep: '● Fuera de horario',
  alert: '● Necesita atención',
  ghost: '● Puesto libre',
}
const STATUS_CLS: Record<AgentStatus, string> = {
  work: 'text-emerald-300',
  sleep: 'text-zinc-400',
  alert: 'text-red-300',
  ghost: 'text-zinc-500',
}

export function OfficeView({ embedded = false }: { embedded?: boolean }) {
  const [departments, setDepartments] = useState<OfficeDepartment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState<string>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [demoDay, setDemoDay] = useState(1)
  const [demoMin, setDemoMin] = useState(7 * 60)
  const [nowTs, setNowTs] = useState(() => Date.now())
  const fetchedAt = useRef(Date.now())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/office', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const d = (await res.json()) as { departments: OfficeDepartment[] }
      setDepartments(d.departments)
      setError(null)
      fetchedAt.current = Date.now()
    } catch {
      setError('No se pudo cargar la oficina. Reintentando…')
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [load])

  // Reloj: en vivo cada 30 s; en demostración corre rápido (~1 hora cada 0,4 s).
  useEffect(() => {
    const id = setInterval(() => {
      if (demo && playing) {
        setDemoMin((m) => {
          const next = m + 60
          if (next >= 1440) { setDemoDay((d) => (d + 1) % 7); return 0 }
          return next
        })
      } else if (!demo) setNowTs(Date.now())
    }, demo ? 400 : 30_000)
    return () => clearInterval(id)
  }, [demo, playing])

  const everyone = useMemo(() => (departments ?? []).flatMap((d) => d.agents.map((a) => ({ a, d }))), [departments])
  const picked = everyone.find((x) => x.a.id === selected) ?? null
  // Con un cuarto enfocado, el panel muestra a su primer agente; con el edificio entero, al primero que necesite atención.
  const focusedDept = departments?.find((d) => d.id === focus) ?? null
  const fallback = focusedDept
    ? everyone.find((x) => x.d.id === focusedDept.id)
    : everyone.find((x) => x.a.status === 'alert') ?? everyone.find((x) => x.a.status === 'work') ?? everyone[0]
  const current = picked ?? fallback ?? null
  const agent = current?.a ?? null
  const dept = current?.d ?? null

  const real = colombiaMinutes(new Date(nowTs))
  const clockDay = demo ? demoDay : real.day
  const clockMin = demo ? demoMin : real.minutes

  const statusOf = useCallback((id: string): AgentStatus => {
    const a = everyone.find((x) => x.a.id === id)?.a
    if (!a) return 'sleep'
    if (a.status === 'ghost') return 'ghost'
    if (!demo) return a.status
    return scheduledNow(a, demoDay, demoMin) ? 'work' : a.status === 'alert' ? 'alert' : 'sleep'
  }, [everyone, demo, demoDay, demoMin])

  if (!departments) {
    return <div className="h-[60vh] animate-pulse rounded-xl bg-zinc-800/60">{error && <p className="p-4 text-sm text-red-300">{error}</p>}</div>
  }
  if (!dept || !agent) return <p className="text-sm text-zinc-400">No hay departamentos todavía.</p>
  const shown = focusedDept ?? dept

  const status = statusOf(agent.id)
  const alerts = (d: OfficeDepartment) => d.agents.filter((a) => a.status === 'alert').length

  return (
    <div className="space-y-4 pb-16">
      {!embedded && (
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">🏢 Oficina</h1>
          <span className="text-sm text-zinc-500">Todos tus agentes, cada uno en su departamento.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-3" role="tablist" aria-label="Enfocar un departamento">
        {[{ id: 'all', label: '🏢 Todo el edificio', n: 0, pending: 0 }, ...departments.map((d) => ({
          id: d.id,
          label: `${d.kind === 'monitoring' ? '🛰️' : d.kind === 'direction' ? '🧭' : '📣'} ${d.name}`,
          n: alerts(d),
          pending: d.kind === 'marketing' ? d.stats[0]?.value ?? 0 : 0,
        }))].map((t) => {
          const on = t.id === focus
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => { setFocus(t.id); setSelected(null) }}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${on ? 'border border-indigo-500/50 bg-indigo-500/20 text-indigo-300' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {t.label}
              {t.n > 0 && <span className="ml-1.5 rounded-full bg-red-500/20 px-1.5 text-[11px] text-red-300">{t.n}</span>}
              {t.pending > 0 && <span className="ml-1.5 text-[11px] text-amber-300">{t.pending}</span>}
            </button>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative h-[56vh] min-h-[380px] lg:h-[660px]">
          <OfficeScene
            departments={departments}
            focus={focus}
            selectedId={agent.id}
            statusOf={statusOf}
            minutes={clockMin}
            onSelect={(id, d) => { setSelected(id); if (focus !== 'all') setFocus(d) }}
          />
          <div className="absolute right-3 top-3 rounded-lg border border-zinc-700 bg-[#0d1220]/85 px-3 py-1.5 text-right font-mono text-xl font-bold text-zinc-100">
            {hh(clockMin)}
            <small className="block text-[10px] font-normal text-zinc-400">{DAY_NAMES[clockDay]}{demo ? ' · demostración' : ' · hora Colombia'}</small>
          </div>
          <p className="absolute bottom-2 left-3 rounded bg-[#0d1220]/80 px-2 py-1 text-[11px] text-zinc-400">Arrastra para girar · rueda o pellizco para acercar · toca a un agente</p>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-white">
              <span className="h-3 w-3 rounded-sm" style={{ background: agent.color }} />
              {agent.name}
              <span className="ml-auto text-[11px] font-normal text-zinc-500">{dept.name}</span>
            </h2>
            <p className="mb-2 text-xs text-zinc-400">{agent.role}</p>
            <span className={`inline-flex rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-bold ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>
            {status === 'work' && agent.doing && <p className="mt-3 rounded-lg bg-zinc-800/70 p-2 text-xs text-zinc-300">{agent.doing}</p>}
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-zinc-500">Horario</dt><dd className="min-w-0 break-words text-zinc-200">{agent.schedule}</dd>
              {agent.nextRun && (<><dt className="text-zinc-500">Próxima corrida</dt><dd className="text-zinc-200">{agent.nextRun}</dd></>)}
              <dt className="text-zinc-500">Modelo</dt><dd className="text-zinc-200">{agent.model}</dd>
              {agent.lastAt && (<><dt className="text-zinc-500">Última actividad</dt><dd className="text-zinc-200">{ago(agent.lastAt, fetchedAt.current)}</dd></>)}
            </dl>
            <div className="mt-3 rounded-lg bg-zinc-800/70 p-2.5 text-xs leading-relaxed text-zinc-300">
              <b className="text-zinc-100">Último informe</b>
              <br />
              {agent.lastReport}
            </div>
            {agent.href && status !== 'ghost' && (
              <Link href={agent.href} className="mt-3 inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-100 hover:border-indigo-400">
                Abrir su trabajo →
              </Link>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
            <h2 className="text-[15px] font-bold text-white">Departamentos</h2>
            <ul className="mt-2 space-y-1.5">
              {departments.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => { setFocus(d.id); setSelected(null) }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${shown.id === d.id && focus !== 'all' ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.accent }} />
                      {d.name}
                      <span className="ml-auto text-[11px] font-normal text-zinc-500">{(() => { const n = d.agents.filter((a) => a.status !== 'ghost').length; return `${n} agente${n === 1 ? '' : 's'}` })()}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-400">{d.note}</span>
                    {d.stats.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-300">
                        {d.stats.map((st) => <span key={st.label}><b className="font-mono">{st.value}</b> {st.label}</span>)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-2.5">
        <button
          onClick={() => { setDemo(!demo); setPlaying(false) }}
          className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${demo ? 'border-amber-500/50 bg-amber-500/10 text-amber-200' : 'border-zinc-700 text-zinc-200 hover:border-zinc-500'}`}
        >
          {demo ? 'Salir de la demostración' : '▶ Ver un día en demostración'}
        </button>
        {demo && (
          <>
            <div className="flex gap-1" role="group" aria-label="Día de la semana">
              {DAYS.map((d, i) => (
                <button key={d} onClick={() => setDemoDay(i)} title={DAY_NAMES[i]} aria-pressed={demoDay === i}
                  className={`h-7 w-7 rounded-md border text-xs font-bold ${demoDay === i ? 'border-indigo-400 bg-indigo-500/20 text-white' : 'border-zinc-700 text-zinc-400'}`}>{d}</button>
              ))}
            </div>
            <button onClick={() => setPlaying(!playing)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-100 hover:border-zinc-500">
              {playing ? '⏸ Pausar' : '▶ Reproducir'}
            </button>
            <label className="flex min-w-[160px] flex-1 items-center gap-2 text-xs text-zinc-400">
              Hora
              <input type="range" min={0} max={1439} step={5} value={demoMin} onChange={(e) => setDemoMin(Number(e.target.value))} className="flex-1 accent-indigo-400" />
            </label>
          </>
        )}
        <span className="ml-auto flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />trabajando</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-500" />fuera de horario</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-400" />necesita atención</span>
        </span>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}
