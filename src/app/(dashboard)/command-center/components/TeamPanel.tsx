'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, GeneratedPost } from '../types'

interface AgentRow { key: string; name: string; role: string; emoji: string; toggleable: boolean; enabled: boolean; modelTier: string; costMonth: number; costWeek: number; calls: number; last: string | null }
interface Activity { id: string; agent: string; summary: string; createdAt: string }
interface Lesson { id: string; text: string; active: boolean }
interface Team {
  agents: AgentRow[]
  totalMonth: number
  budget: { spent: number; limit: number }
  activity: Activity[]
  lessons: Lesson[]
  rejections: { id: string; topic: string; reviewNote: string | null }[]
  mix: { kind: string; label: string; count: number }[]
  mixUntyped: number
  topPosts: { id: string; topic: string; platform: string; publishedAt: string | null; externalUrl: string | null; score: number; reach: number | null; saves: number | null; shares: number | null; comments: number | null; likes: number | null }[]
  deadlines: { at: string; items: { date: string; title: string; who: string; source: string }[] } | null
}
interface Script { hook: string; clips: { n: number; seconds: number; dialogue: string; onScreen: string; prompt: string }[]; caption: string; hashtags: string[]; editorNotes: string; character: string; usingDefaultCharacter: boolean; flags: string[] }
interface BlogRun { ok: boolean; topic?: string; created?: { id: string; locale: string; slug: string; title: string; status: string; url: string }[]; warnings?: string[]; error?: string }
interface Replies { intent: string; replies: { tone: string; text: string; flags: string[] }[]; note: string }

const usd = (n: number) => (n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`)
function ago(iso: string | null): string {
  if (!iso) return 'sin actividad'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  if (m < 1440) return `hace ${Math.round(m / 60)} h`
  return `hace ${Math.round(m / 1440)} d`
}
const TIERS: [string, string][] = [['default', 'Automático'], ['smart', 'Más inteligente'], ['cheap', 'Más barato']]

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function TeamPanel({ companies, initialCompanyId }: { companies: CEOCompany[]; initialCompanyId?: string }) {
  const { showToast } = useToast()
  const [companyId, setCompanyId] = useState(initialCompanyId && companies.some((c) => c.id === initialCompanyId) ? initialCompanyId : companies[0]?.id ?? '')
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState(false)
  const [lesson, setLesson] = useState('')
  const [msg, setMsg] = useState('')
  const [network, setNetwork] = useState('Instagram')
  const [replies, setReplies] = useState<Replies | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [posts, setPosts] = useState<GeneratedPost[]>([])
  const [postId, setPostId] = useState('')
  const [script, setScript] = useState<Script | null>(null)
  const [deadlines, setDeadlines] = useState<Team['deadlines']>(null)
  const [limitInput, setLimitInput] = useState('')
  const [blog, setBlog] = useState<{ configured: boolean; enabled?: boolean; url: string; company: string } | null>(null)
  const [blogTopic, setBlogTopic] = useState('')
  const [blogRun, setBlogRun] = useState<BlogRun | null>(null)
  const [bp, setBp] = useState<{ exists: boolean; legacy?: boolean; website: string; tone: string; audience: string; topics: string; rules: string; cta: string; ctaEn: string; aiWrite: boolean } | null>(null)
  const [bpOpen, setBpOpen] = useState(false)
  const [queue, setQueue] = useState<{ key: string; position: number; title: string; es: boolean; en: boolean; status: string; isLegal: boolean; words: number; urls: string[]; preview: string }[]>([])
  const [importText, setImportText] = useState('')
  const [importRes, setImportRes] = useState<{ saved: number; errors: string[]; warnings: string[] } | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const loadQueue = useCallback(() => { fetch(`/api/ceo/team/blog-articles?companyId=${companyId}`).then((r) => (r.ok ? r.json() : null)).then((d: { items?: typeof queue } | null) => setQueue(d?.items ?? [])).catch(() => {}) }, [companyId])
  useEffect(() => { loadQueue() }, [loadQueue])
  const [dest, setDest] = useState<{ id: string; name: string; blogApiUrl: string; envVar: string; hasKey: boolean; mirrorFrom: string; weekly: boolean; sent: number }[]>([])
  const [destEdit, setDestEdit] = useState<Record<string, { url?: string; from?: string }>>({})
  const loadDest = useCallback(() => { fetch('/api/ceo/team/blog-destinations').then((r) => (r.ok ? r.json() : null)).then((d: { companies?: typeof dest } | null) => setDest(d?.companies ?? [])).catch(() => {}) }, [])
  useEffect(() => { loadDest() }, [loadDest])
  const [bt, setBt] = useState<{ ready: boolean; bank?: boolean; total: number; pending: number; used: number; skipped: number; next: { id: string; title: string; category: string; kind: string }[]; needsInput: { id: string; title: string }[]; recent?: { title: string }[] } | null>(null)
  const loadTopics = useCallback(() => { fetch(`/api/ceo/team/blog-topics?companyId=${companyId}`).then((r) => (r.ok ? r.json() : null)).then((d) => setBt(d)).catch(() => {}) }, [companyId])
  useEffect(() => { loadTopics() }, [loadTopics])
  const [character, setCharacter] = useState('')
  const [charSaved, setCharSaved] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const res = await fetch(`/api/ceo/team?companyId=${companyId}`)
      if (!res.ok) throw new Error()
      const d = (await res.json()) as Team
      setTeam(d)
      setDeadlines(d.deadlines)
      setError(false)
    } catch { setError(true) }
  }, [companyId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    setBp(null)
    setBpOpen(false)
    fetch(`/api/ceo/team/blog-profile?companyId=${companyId}`).then((r) => (r.ok ? r.json() : null)).then((d: { exists: boolean; legacy?: boolean; website: string; tone: string; audience: string; topics: string[]; rules: string; cta: string; ctaEn?: string; aiWrite?: boolean } | null) => { if (d) { setBp({ ...d, ctaEn: d.ctaEn ?? '', aiWrite: !!d.aiWrite, topics: d.topics.join('\n') }); setBpOpen(!d.exists) } }).catch(() => {})
  }, [companyId])
  useEffect(() => { fetch(`/api/ceo/team/luis?companyId=${companyId}`).then((r) => (r.ok ? r.json() : null)).then((d: { companies?: { name: string; configured: boolean }[] } | null) => setBlog(d ? { configured: !!d.companies?.some((c) => c.configured), enabled: (d.companies?.length ?? 0) > 0, url: '', company: companies.find((c) => c.id === companyId)?.name ?? '' } : null)).catch(() => {}) }, [companyId, companies])
  useEffect(() => {
    if (!companyId) return
    fetch(`/api/ceo/team/character?companyId=${companyId}`).then((r) => (r.ok ? r.json() : null)).then((d: { text?: string } | null) => { setCharacter(d?.text ?? ''); setCharSaved(d?.text ?? '') }).catch(() => {})
  }, [companyId])
  useEffect(() => {
    fetch('/api/ceo/content-queue').then((r) => (r.ok ? r.json() : null)).then((d: { posts?: GeneratedPost[] } | null) => {
      const seen = new Set<string>()
      const list = (d?.posts ?? []).filter((p) => p.companyId === companyId && !['rejected', 'failed'].includes(p.status) && !seen.has(p.groupId ?? p.id) && !!seen.add(p.groupId ?? p.id))
      setPosts(list)
      setPostId((cur) => cur || list[0]?.id || '')
    }).catch(() => {})
  }, [companyId])

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key)
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { showToast((d as { error?: string }).error ?? 'No se pudo', 'error'); return null }
      return d
    } catch { showToast('No se pudo conectar', 'error'); return null } finally { setBusy(null) }
  }
  const setting = async (agent: string, body: Record<string, unknown>) => { if (await call('/api/ceo/team/settings', { method: 'PATCH', body: JSON.stringify({ agent, ...body }) }, `set-${agent}`)) await load() }

  if (error) return <p className="text-sm text-red-300">No se pudo cargar el equipo. <button onClick={load} className="underline">Reintentar</button></p>
  if (!team) return <div className="h-40 rounded-xl bg-zinc-800/60 animate-pulse" />
  const nameOf = (k: string) => team.agents.find((a) => a.key === k)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setTeam(null); setScript(null); setReplies(null) }} className="bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
        </select>
        <p className="text-sm text-zinc-300">Gasto aproximado de IA este mes: <b className="text-white">{usd(team.totalMonth)}</b> <span className="text-xs text-zinc-500">(estimado por tokens; la cifra real está en tu consola de Anthropic)</span></p>
      </div>

      {(() => {
        const { spent, limit } = team.budget
        const pct = Math.min(100, Math.round((spent / limit) * 100))
        const tone = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
        const rows = team.agents.filter((a) => a.costMonth > 0).sort((a, b) => b.costMonth - a.costMonth)
        return (
          <Box title="💰 Gasto de IA este mes" hint="Cálculo aproximado por tokens. Al llegar al tope, la IA se detiene sola hasta que lo subas.">
            <div className="space-y-1">
              <div className="flex items-baseline justify-between text-sm text-zinc-200">
                <span><b className="text-white">${spent.toFixed(2)}</b> de ${limit.toFixed(2)}</span>
                <span className="text-xs text-zinc-500">{pct}% del tope</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
            </div>
            {rows.length === 0 ? <p className="text-sm text-zinc-500">Todavía no hay gasto registrado este mes. Se empieza a contar desde que se subió esta versión.</p> : (
              <ul className="space-y-1">
                {rows.map((a) => (
                  <li key={a.key} className="flex items-center gap-2 text-sm text-zinc-200">
                    <span className="w-28 truncate">{a.emoji} {a.name}</span>
                    <span className="flex-1 h-1.5 overflow-hidden rounded-full bg-zinc-800"><span className="block h-full bg-indigo-500" style={{ width: `${Math.round((a.costMonth / Math.max(spent, 0.0001)) * 100)}%` }} /></span>
                    <b className="w-16 text-right">{usd(a.costMonth)}</b>
                    <span className="w-10 text-right text-xs text-zinc-500">{Math.round((a.costMonth / Math.max(spent, 0.0001)) * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Tope mensual (USD):</span>
              <input value={limitInput} onChange={(e) => setLimitInput(e.target.value.replace(/[^\d.]/g, ''))} placeholder={String(limit)} className="w-20 bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200" />
              <button disabled={!limitInput || busy === 'budget'} onClick={async () => { if (await call('/api/ceo/team/settings', { method: 'PATCH', body: JSON.stringify({ budgetUsd: Number(limitInput) }) }, 'budget')) { setLimitInput(''); showToast('Tope actualizado', 'success'); await load() } }} className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40">Cambiar tope</button>
            </div>
          </Box>
        )
      })()}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {team.agents.filter((a) => a.key !== 'system').map((a) => (
          <div key={a.key} className={`rounded-xl border p-3 space-y-2 ${a.enabled ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-800 bg-zinc-900/20 opacity-70'}`}>
            <div className="flex items-start gap-2">
              <span className="text-xl">{a.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{a.name}</p>
                <p className="text-xs text-zinc-500">{a.role}</p>
              </div>
              {a.toggleable && (
                <button onClick={() => setting(a.key, { enabled: !a.enabled })} disabled={busy === `set-${a.key}`} className={`text-xs rounded-full border px-2.5 py-0.5 ${a.enabled ? 'border-emerald-500/40 text-emerald-300' : 'border-zinc-600 text-zinc-400'}`}>
                  {a.enabled ? 'Encendido' : 'Apagado'}
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-400">Gasto: <b className="text-zinc-200">{usd(a.costMonth)}</b> este mes · {usd(a.costWeek)} esta semana · {a.calls} llamadas</p>
            <p className="text-[11px] text-zinc-500">Última actividad: {ago(a.last)}</p>
            {a.toggleable && (
              <select value={a.modelTier} onChange={(e) => setting(a.key, { modelTier: e.target.value })} className="w-full bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200" title="Más barato = modelo Haiku; más inteligente = Sonnet">
                {TIERS.map(([v, l]) => <option key={v} value={v}>Modelo: {l}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="🎯 Mezcla de contenido" hint="Qué tipos de post salieron en los últimos 30 días. La tanda del sábado elige los que menos han salido.">
          {(() => {
            const total = team.mix.reduce((a, b) => a + b.count, 0)
            return total === 0 ? <p className="text-sm text-zinc-500">Todavía no hay posts con tipo. Aparecerán con la próxima tanda.</p> : (
              <ul className="space-y-1.5">
                {team.mix.map((m) => (
                  <li key={m.kind} className="flex items-center gap-2 text-sm text-zinc-200">
                    <span className="w-44 truncate">{m.label}</span>
                    <span className="flex-1 h-1.5 overflow-hidden rounded-full bg-zinc-800"><span className="block h-full bg-indigo-500" style={{ width: `${Math.round((m.count / total) * 100)}%` }} /></span>
                    <b className="w-6 text-right">{m.count}</b>
                  </li>
                ))}
              </ul>
            )
          })()}
          {team.mixUntyped > 0 && <p className="text-[11px] text-zinc-500">{team.mixUntyped} posts anteriores no tienen tipo.</p>}
        </Box>
        <Box title="🏆 Los que mejor funcionaron" hint="Por guardados, compartidos y comentarios. Reutilízalos 14 días después de publicarlos, con otro enfoque y los datos revisados.">
          {team.topPosts.length === 0 ? <p className="text-sm text-zinc-500">Aparecerán cuando lleguen las métricas (el paso de Make que sigue).</p> : (
            <ul className="space-y-2">
              {team.topPosts.map((p) => {
                const old = p.publishedAt ? (Date.now() - new Date(p.publishedAt).getTime()) / 86400000 >= 14 : false
                return (
                  <li key={p.id} className="text-sm text-zinc-200">
                    <span className="block truncate">{p.topic}</span>
                    <span className="text-xs text-zinc-500">{p.reach ?? '—'} alcance · {p.saves ?? 0} guardados · {p.shares ?? 0} compartidos · {p.comments ?? 0} comentarios</span>
                    <button
                      disabled={!old || busy === `rec-${p.id}`}
                      title={old ? 'Crea un borrador nuevo con otro enfoque' : 'Espera 14 días desde que se publicó'}
                      onClick={async () => { if (await call(`/api/ceo/content/${p.id}/recycle`, { method: 'POST' }, `rec-${p.id}`)) { showToast('Borrador nuevo creado: míralo en la pestaña de la empresa', 'success'); await load() } }}
                      className="ml-2 text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-0.5 hover:bg-indigo-500/10 disabled:opacity-40"
                    >{busy === `rec-${p.id}` ? 'Creando…' : '♻️ Reutilizar'}</button>
                  </li>
                )
              })}
            </ul>
          )}
        </Box>
      </div>

      <Box title="📋 Qué hicieron" hint="Lo último que hizo cada agente, de más nuevo a más viejo.">
        {team.activity.length === 0 ? <p className="text-sm text-zinc-500">Todavía no hay actividad registrada. Aparecerá cuando corran las tareas automáticas.</p> : (
          <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {team.activity.map((a) => (
              <li key={a.id} className="text-sm text-zinc-200">
                <span className="mr-1">{nameOf(a.agent)?.emoji}</span><b>{nameOf(a.agent)?.name}:</b> {a.summary}
                <span className="ml-2 text-xs text-zinc-500">{ago(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box title="🧠 Lo que aprendió el equipo" hint="Reglas que Fernanda y los demás siguen al escribir. Escríbelas tú o apágalas cuando ya no apliquen.">
        <div className="flex flex-wrap gap-2">
          <input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Ej: no uses signos de admiración en los títulos" maxLength={300} className="flex-1 min-w-[220px] bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100" />
          <button
            disabled={lesson.trim().length < 5 || busy === 'lesson'}
            onClick={async () => { if (await call('/api/ceo/team/lessons', { method: 'POST', body: JSON.stringify({ companyId, text: lesson }) }, 'lesson')) { setLesson(''); await load() } }}
            className="px-3 py-1.5 rounded-lg text-sm text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10 disabled:opacity-40"
          >Agregar regla</button>
        </div>
        <ul className="space-y-1.5">
          {team.lessons.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={l.active} onChange={async (e) => { await call('/api/ceo/team/lessons', { method: 'PATCH', body: JSON.stringify({ id: l.id, active: e.target.checked }) }, 'l'); await load() }} />
              <span className={`flex-1 ${l.active ? 'text-zinc-200' : 'text-zinc-500 line-through'}`}>{l.text}</span>
              <button onClick={async () => { await call(`/api/ceo/team/lessons?id=${l.id}`, { method: 'DELETE' }, 'l'); await load() }} className="text-xs text-red-300/80 hover:text-red-200">Borrar</button>
            </li>
          ))}
          {team.rejections.map((r) => (
            <li key={r.id} className="text-xs text-zinc-500">↳ De un post que rechazaste, «{r.topic.slice(0, 50)}»: {r.reviewNote}</li>
          ))}
          {team.lessons.length === 0 && team.rejections.length === 0 && <li className="text-sm text-zinc-500">Aún no hay reglas. Cuando rechaces un post con una nota, también aprenderán de ella.</li>}
        </ul>
      </Box>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="💬 María: respuestas a comentarios" hint="Pega un comentario o mensaje y te propone 3 respuestas. No envía nada: tú copias la que te guste.">
          <div className="flex gap-2">
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className="bg-zinc-800/70 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200">
              {['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp'].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={1200} placeholder="Pega aquí el comentario o mensaje de la persona" className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2.5 text-sm text-zinc-100" />
          <button disabled={!msg.trim() || busy === 'maria'} onClick={async () => { const d = (await call('/api/ceo/team/maria', { method: 'POST', body: JSON.stringify({ companyId, message: msg, network }) }, 'maria')) as Replies | null; if (d) { setReplies(d); await load() } }} className="px-3 py-1.5 rounded-lg text-sm text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10 disabled:opacity-40">
            {busy === 'maria' ? 'Pensando…' : 'Proponer respuestas'}
          </button>
          {replies && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">Tipo de mensaje: <b>{replies.intent}</b>{replies.note ? ` · ${replies.note}` : ''}</p>
              {replies.replies.map((r, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">{r.tone}</p>
                  <p className="text-sm text-zinc-100 whitespace-pre-wrap">{r.text}</p>
                  {r.flags.length > 0 && <p className="text-xs text-red-300">⚠️ {r.flags.join('; ')}</p>}
                  <button onClick={() => navigator.clipboard.writeText(r.text).then(() => showToast('Respuesta copiada', 'success'))} className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-0.5 hover:border-zinc-500">Copiar</button>
                </div>
              ))}
            </div>
          )}
        </Box>

        <Box title="🧾 Isabel: fechas límite de impuestos" hint="Busca en fuentes oficiales (IRS y similares) las fechas de los próximos 75 días para negocios pequeños e independientes.">
          <button disabled={busy === 'isabel'} onClick={async () => { const d = (await call('/api/ceo/team/isabel', { method: 'POST', body: JSON.stringify({ companyId }) }, 'isabel')) as Team['deadlines']; if (d) { setDeadlines(d); await load() } }} className="px-3 py-1.5 rounded-lg text-sm text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10 disabled:opacity-40">
            {busy === 'isabel' ? 'Buscando… (1 a 2 min)' : deadlines ? 'Actualizar fechas' : 'Buscar fechas'}
          </button>
          {deadlines && (
            deadlines.items.length === 0 ? <p className="text-sm text-zinc-500">No encontró fechas confirmadas en fuentes oficiales.</p> : (
              <ul className="space-y-1.5">
                {deadlines.items.map((d) => (
                  <li key={d.date + d.title} className="text-sm text-zinc-200">
                    <b>{d.date.split('-').reverse().join('/')}</b> · {d.title}
                    <span className="block text-xs text-zinc-500">{d.who} · <a href={d.source} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">fuente ↗</a></span>
                  </li>
                ))}
              </ul>
            )
          )}
          {deadlines && <p className="text-[11px] text-zinc-500">Consultado {ago(deadlines.at)}. Confirma siempre la fecha en IRS.gov antes de avisarle a un cliente.</p>}
        </Box>
      </div>

      <Box title={`📝 Luis · Blog de ${blog?.company || companies.find((c) => c.id === companyId)?.name || 'la empresa'}`} hint="Todo el blog de esta empresa en un solo lugar: conexión, perfil, artículos y envío. Todo llega como BORRADOR; tú lo revisas y lo publicas desde tu panel del blog.">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">1 · Conexión del blog</p>
        <ul className="space-y-3">
          {dest.filter((c) => c.id === companyId).map((c) => {
            const e = destEdit[c.id] ?? {}
            const url = e.url ?? c.blogApiUrl
            const from = e.from ?? c.mirrorFrom
            const dirty = e.url !== undefined || e.from !== undefined
            return (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 space-y-1.5">
                <p className="text-sm text-zinc-200"><b>{c.name}</b> <span className={`text-xs ${c.hasKey ? 'text-emerald-300' : 'text-zinc-500'}`}>{c.hasKey ? '· blog conectado' : c.blogApiUrl ? '· falta la clave en Railway' : '· sin blog'}</span>{c.sent > 0 ? <span className="text-xs text-zinc-500"> · {c.sent} enviados</span> : null}</p>
                <div className="flex flex-wrap gap-2">
                  <input value={url} onChange={(ev) => setDestEdit((x) => ({ ...x, [c.id]: { ...x[c.id], url: ev.target.value } }))} placeholder="Dirección del blog, ej: https://miblog.com" className="flex-1 min-w-[220px] bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200" />
                  <select value={from} onChange={(ev) => setDestEdit((x) => ({ ...x, [c.id]: { ...x[c.id], from: ev.target.value } }))} className="bg-zinc-800/70 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-200" title="Qué empresa publica lo que se va a copiar a este blog">
                    <option value="">No copiar automáticamente</option>
                    {dest.map((o) => <option key={o.id} value={o.id}>{o.id === c.id ? `Copiar lo que publique ${o.name} (esta misma empresa)` : `Copiar lo que publique ${o.name}`}</option>)}
                  </select>
                  <button
                    disabled={!dirty || busy === `dest-${c.id}`}
                    onClick={async () => { if (await call('/api/ceo/team/blog-destinations', { method: 'PUT', body: JSON.stringify({ companyId: c.id, blogApiUrl: url, mirrorFrom: from || null }) }, `dest-${c.id}`)) { setDestEdit((x) => { const { [c.id]: _, ...r } = x; return r }); showToast('Blog guardado', 'success'); loadDest() } }}
                    className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40"
                  >Guardar</button>
                </div>
                {url && !c.hasKey && <p className="text-xs text-amber-300">En Railway agrega la variable <b>{c.envVar}</b> con la clave del blog (solo borradores). No la pegues en el chat.</p>}
                {c.mirrorFrom && c.hasKey && <p className="text-xs text-zinc-500">Desde que lo activaste, cada post publicado se manda aquí como borrador (máximo 3 cada 30 minutos).</p>}
              </li>
            )
          })}
        </ul>
        </div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">2 · Perfil y reglas de Luis</p>
        {bp && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 space-y-2">
            <button onClick={() => setBpOpen((v) => !v)} className="text-xs text-zinc-300 underline">{bp.exists ? '⚙️ Perfil del blog (ya guardado)' : '⚙️ Crear el perfil del blog (falta guardarlo)'} {bpOpen ? '▲' : '▼'}</button>
            {bpOpen && (
              <div className="space-y-2">
                {bp.legacy === false && bp.exists && <p className="text-xs text-zinc-500">Luis usa el <b>tono, el público y los temas</b> del perfil de marca de esta empresa (los de sus redes); aquí solo se ajusta lo del blog.</p>}
                {([['website', 'Web (https://…)', 1], ['tone', 'Tono', 2], ['audience', 'Público', 2], ['topics', 'Temas del blog (uno por línea)', 7], ['rules', 'Reglas para Luis (una por línea)', 5], ['cta', 'Llamado a la acción al final (incluye el enlace o número de WhatsApp)', 2], ['ctaEn', 'Llamado a la acción en inglés (opcional; si lo dejas vacío se arma solo)', 2]] as const).filter(([k]) => bp.legacy !== false || !bp.exists || !['tone', 'audience', 'topics'].includes(k)).map(([k, label, rows]) => (
                  <label key={k} className="block text-xs text-zinc-400">{label}
                    <textarea value={bp[k]} onChange={(e) => setBp({ ...bp, [k]: e.target.value })} rows={rows} className="mt-1 w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2 text-sm text-zinc-100" />
                  </label>
                ))}
                {/https?:\/\/|\+?\d{8,}/.test(bp.cta) ? null : <p className="text-xs text-amber-300">Al llamado a la acción le falta el enlace o número de WhatsApp: agrégalo, por ejemplo https://wa.me/1XXXXXXXXXX</p>}
                <label className="flex items-start gap-2 text-xs text-zinc-300">
                  <input type="checkbox" checked={bp.aiWrite} onChange={(e) => setBp({ ...bp, aiWrite: e.target.checked })} className="mt-0.5" />
                  <span>Si no quedan artículos listos en la cola, que Luis escriba uno con IA <span className="text-zinc-500">(cuesta unos centavos; apagado = solo se manda lo que tú subes)</span></span>
                </label>
                <button
                  disabled={busy === 'bp'}
                  onClick={async () => { if (await call('/api/ceo/team/blog-profile', { method: 'PUT', body: JSON.stringify({ companyId, website: bp.website, tone: bp.tone, audience: bp.audience, topics: bp.topics.split('\n'), rules: bp.rules, cta: bp.cta, ctaEn: bp.ctaEn, aiWrite: bp.aiWrite }) }, 'bp')) { setBp({ ...bp, exists: true }); showToast('Perfil del blog guardado', 'success') } }}
                  className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40"
                >Guardar perfil</button>
              </div>
            )}
          </div>
        )}
        {bt?.bank !== false && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 space-y-2">
          <p className="text-xs text-zinc-300">📚 Banco de temas {bt?.ready && bt.total > 0 ? <span className="text-zinc-500">· {bt.pending} por escribir · {bt.used} escritos{bt.skipped ? ` · ${bt.skipped} saltados` : ''}</span> : null}</p>
          {bt && bt.total === 0 && (
            <button
              disabled={busy === 'topics' || !bt.ready}
              onClick={async () => { const d = (await call('/api/ceo/team/blog-topics', { method: 'POST', body: JSON.stringify({ companyId }) }, 'topics')) as { added?: number } | null; if (d) { showToast(`${d.added} temas cargados`, 'success'); loadTopics() } }}
              className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40"
            >Cargar mis temas (78)</button>
          )}
          {bt && !bt.ready && <p className="text-xs text-amber-300">Primero guarda el perfil del blog (abajo) para crear la empresa.</p>}
          {bt && bt.next.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Los próximos en salir</p>
              <ol className="list-decimal pl-5 space-y-0.5 text-xs text-zinc-300">
                {bt.next.map((t) => (
                  <li key={t.id}>{t.title}{t.kind === 'legal' ? <span className="text-amber-300"> · tema legal: llevará la nota de confirmar con un abogado</span> : null}
                    <button onClick={async () => { if (await call('/api/ceo/team/blog-topics', { method: 'PATCH', body: JSON.stringify({ id: t.id, status: 'skipped', companyId }) }, 'skip')) loadTopics() }} className="ml-2 text-zinc-500 hover:text-zinc-300 underline">saltar</button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {bt && bt.needsInput.length > 0 && (
            <p className="text-[11px] text-zinc-500">Necesitan tus datos reales (casos, testimonios o novedades), Luis no los escribe solo: {bt.needsInput.map((t) => `«${t.title}»`).join(', ')}. Para escribirlos, pon el tema y los hechos en el cuadro de abajo.</p>
          )}
        </div>
        )}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 space-y-2">
          <p className="text-xs text-zinc-300">📥 Artículos listos <span className="text-zinc-500">· los escribes tú con otra IA y salen solos, uno por semana, como borrador</span></p>
          <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={4} placeholder={'Pega aquí uno o varios artículos con este formato:\n@@@ARTICULO\nidioma: es\nclave: cuadrar-la-caja\ntitulo: …\ndescripcion: …\n---\n(contenido en Markdown)\n@@@FIN'} className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2 text-xs text-zinc-100 font-mono" />
          <button
            disabled={importText.trim().length < 50 || busy === 'import'}
            onClick={async () => { const d = (await call('/api/ceo/team/blog-articles', { method: 'POST', body: JSON.stringify({ text: importText, companyId }) }, 'import')) as { saved: number; errors: string[]; warnings: string[] } | null; if (d) { setImportRes(d); if (d.saved > 0 && d.errors.length === 0) setImportText(''); loadQueue(); loadTopics() } }}
            className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40"
          >{busy === 'import' ? 'Revisando…' : 'Subir a la cola'}</button>
          {importRes && (
            <div className="space-y-1 text-xs">
              {importRes.saved > 0 && <p className="text-emerald-300">✅ {importRes.saved} {importRes.saved === 1 ? 'versión guardada' : 'versiones guardadas'}.</p>}
              {importRes.errors.map((e) => <p key={e} className="text-red-300">✕ {e}</p>)}
              {importRes.warnings.map((w) => <p key={w} className="text-amber-300">⚠️ {w}</p>)}
            </div>
          )}
          {queue.length > 0 && (
            <ul className="space-y-1.5">
              {queue.map((q) => (
                <li key={q.key} className="rounded-md border border-zinc-800 bg-zinc-900/50 p-2 text-xs text-zinc-300 space-y-1">
                  <p>
                    <b className="text-zinc-100">{q.status === 'ready' ? `#${q.position}` : q.status === 'sent' ? '✅' : '⏸'} {q.title}</b>
                    <span className="text-zinc-500"> · {q.es ? 'ES' : ''}{q.es && q.en ? ' + ' : ''}{q.en ? 'EN' : ''}{!q.en ? ' (sin inglés)' : ''} · {q.words} palabras{q.isLegal ? ' · con nota legal' : ''}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => setOpenKey(openKey === q.key ? null : q.key)} className="text-zinc-400 underline">{openKey === q.key ? 'ocultar' : 'ver'}</button>
                    {q.status !== 'sent' && <button disabled={busy === `send-${q.key}`} onClick={async () => { const d = (await call('/api/ceo/team/blog-articles', { method: 'PATCH', body: JSON.stringify({ key: q.key, action: 'send', companyId }) }, `send-${q.key}`)) as { ok?: boolean } | null; if (d?.ok) { showToast('Enviado al blog como borrador', 'success'); loadQueue() } }} className="text-indigo-300 underline disabled:opacity-40">{busy === `send-${q.key}` ? 'enviando…' : 'enviar ahora'}</button>}
                    {q.status === 'ready' && <button onClick={async () => { if (await call('/api/ceo/team/blog-articles', { method: 'PATCH', body: JSON.stringify({ key: q.key, action: 'skip', companyId }) }, 'q')) loadQueue() }} className="text-zinc-500 hover:text-zinc-300 underline">pausar</button>}
                    {q.status === 'skipped' && <button onClick={async () => { if (await call('/api/ceo/team/blog-articles', { method: 'PATCH', body: JSON.stringify({ key: q.key, action: 'ready', companyId }) }, 'q')) loadQueue() }} className="text-zinc-400 underline">reactivar</button>}
                    {q.status !== 'sent' && <button onClick={async () => { if (window.confirm('¿Quitar este artículo de la cola?') && await call('/api/ceo/team/blog-articles', { method: 'PATCH', body: JSON.stringify({ key: q.key, action: 'delete', companyId }) }, 'q')) loadQueue() }} className="text-red-300/80 underline">quitar</button>}
                    {q.urls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline">abrir en el blog ↗</a>)}
                  </div>
                  {openKey === q.key && <pre className="whitespace-pre-wrap rounded bg-zinc-950 border border-zinc-800 p-2 text-[11px] text-zinc-400">{q.preview}…</pre>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">5 · Escribir un artículo ahora</p>
        <input value={blogTopic} onChange={(e) => setBlogTopic(e.target.value)} maxLength={200} placeholder="Tema (opcional). Si lo dejas vacío, Luis toma el siguiente tema pendiente" className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100" />
        <button
          disabled={!blog?.configured || busy === 'luis'}
          onClick={async () => { const d = (await call('/api/ceo/team/luis', { method: 'POST', body: JSON.stringify({ topic: blogTopic, companyId }) }, 'luis')) as BlogRun | null; if (d) { setBlogRun(d); await load() } }}
          className="px-3 py-1.5 rounded-lg text-sm text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10 disabled:opacity-40"
        >{busy === 'luis' ? 'Escribiendo… (1 a 3 min)' : 'Escribir un artículo ahora'}</button>
        {blogRun?.ok && (
          <div className="space-y-1.5 text-sm text-zinc-200">
            <p>✅ Borrador enviado sobre «{blogRun.topic}».</p>
            <ul className="space-y-1">
              {blogRun.created?.map((c) => (
                <li key={c.id}><b>{c.locale.toUpperCase()}</b> · {c.title} <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 underline">abrir ↗</a></li>
              ))}
            </ul>
            {blogRun.warnings?.map((w) => <p key={w} className="text-xs text-amber-300">⚠️ {w}</p>)}
            <p className="text-xs text-zinc-500">Abre tu panel del blog (Generales → Blog), revisa y publica. El borrador no se ve al público.</p>
          </div>
        )}
      </Box>

      <Box title="🎬 Tomás: prompts de video para Veo" hint="Elige un post y te prepara los prompts, clip por clip, para crear el reel en Veo. Tú generas los clips; él no crea el video.">
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-300">Personaje de los videos <span className="text-zinc-500">(la misma descripción va en todos los clips, en inglés; sube también la misma foto de referencia en Veo)</span></p>
          <textarea value={character} onChange={(e) => setCharacter(e.target.value)} rows={3} maxLength={1200} placeholder="Ej: a friendly Latina woman in her mid-30s, shoulder-length dark brown wavy hair, warm brown eyes, navy blazer over a white top, gold stud earrings" className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2.5 text-sm text-zinc-100" />
          <button disabled={character === charSaved || busy === 'char'} onClick={async () => { if (await call('/api/ceo/team/character', { method: 'PUT', body: JSON.stringify({ companyId, text: character }) }, 'char')) { setCharSaved(character); showToast('Personaje guardado', 'success') } }} className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2 py-1 hover:bg-indigo-500/10 disabled:opacity-40">Guardar personaje</button>
        </div>
        {posts.length === 0 ? <p className="text-sm text-zinc-500">No hay posts para convertir todavía.</p> : (
          <>
            <select value={postId} onChange={(e) => { setPostId(e.target.value); setScript(null) }} className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100">
              {posts.map((p) => <option key={p.id} value={p.id}>{p.topic.slice(0, 90)}</option>)}
            </select>
            <button disabled={!postId || busy === 'tomas'} onClick={async () => { const d = (await call('/api/ceo/team/tomas', { method: 'POST', body: JSON.stringify({ postId }) }, 'tomas')) as Script | null; if (d) { setScript(d); await load() } }} className="px-3 py-1.5 rounded-lg text-sm text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10 disabled:opacity-40">
              {busy === 'tomas' ? 'Escribiendo… (hasta 1 min)' : 'Preparar prompts'}
            </button>
          </>
        )}
        {script && (
          <div className="space-y-3 text-sm text-zinc-200">
            {script.usingDefaultCharacter && <p className="text-xs text-amber-300">Usé un personaje de ejemplo. Escribe el tuyo arriba para que sea siempre la misma persona.</p>}
            <p><b>Gancho:</b> {script.hook}</p>
            {script.clips.map((c) => (
              <div key={c.n} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Clip {c.n} · ~{c.seconds} s</p>
                <p className="text-xs text-zinc-400">Dice: <span className="text-zinc-200">“{c.dialogue}”</span> · Texto en pantalla (en el editor): {c.onScreen || '—'}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-zinc-900 border border-zinc-800 p-2 text-[11px] text-zinc-300">{c.prompt}</pre>
                <button onClick={() => navigator.clipboard.writeText(c.prompt).then(() => showToast(`Prompt del clip ${c.n} copiado`, 'success'))} className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-0.5 hover:border-zinc-500">Copiar prompt</button>
              </div>
            ))}
            {script.editorNotes && <p className="text-xs text-zinc-400"><b>Al editar:</b> {script.editorNotes}</p>}
            {script.caption && <p className="text-xs text-zinc-400"><b>Texto para publicar:</b> {script.caption} {script.hashtags.join(' ')}</p>}
            {script.flags.length > 0 && <p className="text-xs text-red-300">⚠️ {script.flags.join('; ')}. Corrígelo antes de crear los clips.</p>}
            <button onClick={() => navigator.clipboard.writeText(script.clips.map((c) => `CLIP ${c.n} (${c.seconds}s)\n${c.prompt}`).join('\n\n')).then(() => showToast('Todos los prompts copiados', 'success'))} className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500">Copiar todos los prompts</button>
          </div>
        )}
      </Box>
    </div>
  )
}
