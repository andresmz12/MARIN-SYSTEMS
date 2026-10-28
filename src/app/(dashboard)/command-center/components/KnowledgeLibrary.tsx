'use client'

import { useCallback, useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany } from '../types'

interface Doc { id: string; title: string; sourceUrl: string | null; companyId: string | null; chars: number; createdAt: string }

// Biblioteca de impuestos: lo único que la IA puede citar para montos, fechas y requisitos.
export function KnowledgeLibrary({ companies }: { companies: CEOCompany[] }) {
  const { showToast } = useToast()
  const [docs, setDocs] = useState<Doc[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/ceo/knowledge')
    if (res.ok) setDocs(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  async function readFile(f: File) {
    if (!/\.(txt|md|csv)$/i.test(f.name)) { showToast('Por ahora sube .txt o .md, o pega el texto (de un PDF: ábrelo, copia y pega)', 'error'); return }
    setContent(await f.text())
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/ceo/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, sourceUrl, companyId: companyId || null }),
      })
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(d.error ?? 'No se pudo guardar')
      showToast('Documento guardado en la biblioteca', 'success')
      setTitle(''); setContent(''); setSourceUrl('')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo guardar', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('¿Quitar este documento de la biblioteca?')) return
    const res = await fetch(`/api/ceo/knowledge/${id}`, { method: 'DELETE' })
    if (res.ok) await load()
    else showToast('No se pudo quitar', 'error')
  }

  const nameOf = (id: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? 'Empresa' : 'Todas las empresas')

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-1">
        <p className="text-sm font-semibold text-zinc-100">📚 Biblioteca de impuestos</p>
        <p className="text-xs text-zinc-400">
          Sube aquí guías, publicaciones del IRS, tus propias explicaciones o plantillas. Al crear contenido, la IA usa SOLO esta biblioteca
          (y las fuentes oficiales) para montos, fechas y requisitos, y el verificador de datos las compara con ella. Si algo no está, no lo afirma.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
        <p className="text-sm font-semibold text-zinc-100">Agregar documento</p>
        <div className="flex flex-wrap gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ej: Guía 1099-K 2026)" className="flex-1 min-w-[200px] bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100" />
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200">
            <option value="">Todas las empresas</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Enlace de la fuente (opcional)" className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200" />
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="Pega aquí el texto del documento…" className="w-full bg-zinc-800/70 border border-zinc-700 rounded-lg p-2.5 text-sm text-zinc-100 resize-y" />
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={busy || !title.trim() || content.trim().length < 20} className="px-3.5 py-1.5 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 disabled:opacity-40">
            {busy ? 'Guardando…' : 'Guardar en la biblioteca'}
          </button>
          <label className="text-xs text-indigo-200 border border-indigo-500/40 rounded-md px-2.5 py-1.5 hover:bg-indigo-500/10 cursor-pointer">
            Cargar archivo .txt / .md
            <input type="file" accept=".txt,.md,.csv,text/plain,text/markdown" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }} />
          </label>
          <span className="text-[11px] text-zinc-500">{content.length.toLocaleString('es-CO')} / 60.000 caracteres</span>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-200">En la biblioteca ({docs.length})</h3>
        {docs.length === 0 && <p className="text-sm text-zinc-500">Todavía no hay documentos.</p>}
        {docs.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <span className="text-sm text-zinc-200 flex-1 min-w-[180px] truncate">{d.title}</span>
            <span className="text-xs text-zinc-500">{nameOf(d.companyId)} · {d.chars.toLocaleString('es-CO')} caracteres</span>
            {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-300 hover:text-indigo-200">Fuente ↗</a>}
            <button onClick={() => remove(d.id)} className="text-xs text-red-300 hover:text-red-200">Quitar</button>
          </div>
        ))}
      </div>
    </div>
  )
}
