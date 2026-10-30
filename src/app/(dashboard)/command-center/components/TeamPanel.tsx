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
  activity: Activity[]
  lessons: Lesson[]
  rejections: { id: string; topic: string; reviewNote: string | null }[]
  deadlines: { at: string; items: { date: string; title: string; who: string; source: string }[] } | null
}
interface Script { hook: string; scenes: { onScreen: string; voice: string; visual: string }[]; caption: string; avatarNotes: string; flags: string[] }
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

export function TeamPanel({ companies }: { companies: CEOCompany[] }) {
  const { showToast } = useToast()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
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

      <Box title="🎬 Tomás: guion de reel" hint="Elige un post y te escribe el guion de un video de ~30 segundos para el avatar. Todavía no genera el video.">
        {posts.length === 0 ? <p className="text-sm text-zinc-500">No hay posts para convertir todavía.</p> : (
          <>
            <select value={postId} onChange={(e) => { setPostId(e.target.value); setScript(null) }} className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100">
              {posts.map((p) => <option key={p.id} value={p.id}>{p.topic.slice(0, 90)}</option>)}
            </select>
            <button disabled={!postId || busy === 'tomas'} onClick={async () => { const d = (await call('/api/ceo/team/tomas', { method: 'POST', body: JSON.stringify({ postId }) }, 'tomas')) as Script | null; if (d) { setScript(d); await load() } }} className="px-3 py-1.5 rounded-lg text-sm text-indigo-200 border border-indigo-500/40 hover:bg-indigo-500/10 disabled:opacity-40">
              {busy === 'tomas' ? 'Escribiendo…' : 'Escribir guion'}
            </button>
          </>
        )}
        {script && (
          <div className="space-y-2 text-sm text-zinc-200">
            <p><b>Gancho:</b> {script.hook}</p>
            <ol className="space-y-1.5 list-decimal pl-5">
              {script.scenes.map((s, i) => (
                <li key={i}>
                  <span className="text-zinc-100">{s.voice}</span>
                  <span className="block text-xs text-zinc-500">En pantalla: {s.onScreen} · Se ve: {s.visual}</span>
                </li>
              ))}
            </ol>
            {script.avatarNotes && <p className="text-xs text-zinc-400">Avatar: {script.avatarNotes}</p>}
            {script.caption && <p className="text-xs text-zinc-400">Texto para publicar: {script.caption}</p>}
            {script.flags.length > 0 && <p className="text-xs text-red-300">⚠️ {script.flags.join('; ')}. Corrígelo antes de grabar.</p>}
            <button onClick={() => navigator.clipboard.writeText([script.hook, ...script.scenes.map((s) => `• ${s.voice}  [${s.onScreen}]`), script.caption].join('\n')).then(() => showToast('Guion copiado', 'success'))} className="text-xs text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 hover:border-zinc-500">Copiar guion</button>
          </div>
        )}
      </Box>
    </div>
  )
}
