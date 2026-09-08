'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import jsPDF from 'jspdf'
import { InkCanvas, InkCanvasHandle } from '@/components/meetings/InkCanvas'
import { MindMapCanvas, MindMapCanvasHandle } from '@/components/meetings/MindMapCanvas'
import { MeetingPage, newInkPage, newMindmapPage, mindmapToText } from '@/components/meetings/types'

// Older meetings were saved before the `shapes` field existed on ink pages —
// normalize on load so InkCanvas never sees `undefined` there.
function normalizePages(pages: MeetingPage[]): MeetingPage[] {
  return pages.map((p) => (p.type === 'ink' ? { ...p, shapes: p.shapes ?? [] } : p))
}
import { formatDateTime } from '@/lib/utils'

interface CompanyLite { id: string; name: string; color: string; emoji: string }
interface MeetingTaskItem { id: string; title: string; done: boolean }
interface MeetingDetail {
  id: string
  title: string
  date: string
  pages: MeetingPage[]
  summary: string | null
  company: CompanyLite | null
  tasks: MeetingTaskItem[]
}

export default function MeetingDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const inkRef = useRef<InkCanvasHandle>(null)
  const mapRef = useRef<MindMapCanvasHandle>(null)

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [pages, setPages] = useState<MeetingPage[]>([])
  const [activePageIdx, setActivePageIdx] = useState(0)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/meetings/${id}`)
      if (res.ok) {
        const data: MeetingDetail = await res.json()
        setMeeting(data)
        setPages(data.pages && data.pages.length > 0 ? normalizePages(data.pages) : [newInkPage('Página 1')])
        setTitle(data.title)
        setActivePageIdx(0)
      }
    } finally {
      setLoading(false)
    }
  }

  async function save(pagesOverride?: MeetingPage[]) {
    setSaving(true)
    try {
      await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, pages: pagesOverride ?? pages }),
      })
    } finally {
      setSaving(false)
    }
  }

  function updatePage(idx: number, page: MeetingPage) {
    setPages((ps) => ps.map((p, i) => (i === idx ? page : p)))
  }

  function addPage(type: 'ink' | 'mindmap') {
    const page = type === 'ink' ? newInkPage(`Página ${pages.length + 1}`) : newMindmapPage(`Mapa ${pages.length + 1}`)
    setPages((ps) => [...ps, page])
    setActivePageIdx(pages.length)
    setAddMenuOpen(false)
  }

  function deletePage(idx: number) {
    if (pages.length <= 1) return
    if (!confirm('¿Eliminar esta página?')) return
    setPages((ps) => ps.filter((_, i) => i !== idx))
    setActivePageIdx((i) => Math.max(0, i - (i >= idx ? 1 : 0)))
  }

  async function extractTasks() {
    setError(null)
    setExtracting(true)
    try {
      await save()
      const images: string[] = []
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].type !== 'ink') continue
        // Only the currently-mounted canvas ref can export; switch pages briefly.
        setActivePageIdx(i)
        await new Promise((r) => setTimeout(r, 50))
        const png = await inkRef.current?.exportPng()
        if (png) images.push(png)
      }
      const mindmapText = pages
        .filter((p): p is Extract<MeetingPage, { type: 'mindmap' }> => p.type === 'mindmap')
        .map(mindmapToText)
        .join('\n\n')

      const res = await fetch(`/api/meetings/${id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, mindmapText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudieron extraer las tareas')
        return
      }
      await load()
    } finally {
      setExtracting(false)
    }
  }

  async function toggleTask(taskId: string, done: boolean) {
    setMeeting((m) => m ? { ...m, tasks: m.tasks.map((t) => t.id === taskId ? { ...t, done } : t) } : m)
    await fetch(`/api/meetings/${id}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    })
  }

  async function deleteMeeting() {
    if (!confirm('¿Eliminar esta reunión y sus notas?')) return
    await fetch(`/api/meetings/${id}`, { method: 'DELETE' })
    router.push('/reuniones')
  }

  async function exportPdf() {
    if (!meeting) return
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFontSize(18)
    doc.text(title || 'Reunión', 40, 50)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(formatDateTime(meeting.date), 40, 68)
    if (meeting.company) doc.text(`Empresa: ${meeting.company.name}`, 40, 82)

    let y = 105
    if (meeting.summary) {
      doc.setFontSize(13)
      doc.setTextColor(20)
      doc.text('Resumen', 40, y)
      y += 18
      doc.setFontSize(10)
      doc.setTextColor(60)
      const lines = doc.splitTextToSize(meeting.summary, pageWidth - 80)
      doc.text(lines, 40, y)
      y += lines.length * 13 + 16
    }

    if (meeting.tasks.length > 0) {
      doc.setFontSize(13)
      doc.setTextColor(20)
      doc.text('Tareas', 40, y)
      y += 18
      doc.setFontSize(10)
      doc.setTextColor(60)
      meeting.tasks.forEach((t) => {
        doc.text(`${t.done ? '[x]' : '[ ]'} ${t.title}`, 44, y)
        y += 15
      })
      y += 10
    }

    // Render every page as an image, one per PDF page.
    for (let i = 0; i < pages.length; i++) {
      setActivePageIdx(i)
      await new Promise((r) => setTimeout(r, 50))
      const png = pages[i].type === 'ink' ? await inkRef.current?.exportPng() : await mapRef.current?.exportPng()
      if (!png) continue
      doc.addPage()
      doc.setFontSize(12)
      doc.setTextColor(20)
      doc.text(pages[i].title, 40, 40)
      const imgW = pageWidth - 80
      const ratio = pages[i].type === 'ink' ? 1360 / 1000 : 800 / 1000
      doc.addImage(png, 'PNG', 40, 55, imgW, imgW * ratio)
    }

    doc.save(`reunion-${(title || 'sin-titulo').toLowerCase().replace(/\s+/g, '-')}.pdf`)
  }

  if (loading) return <div className="h-96 bg-[var(--bg-elevated)] animate-pulse rounded-xl" />
  if (!meeting) return <p className="text-sm text-gray-500">Reunión no encontrada.</p>

  const activePage = pages[activePageIdx]

  return (
    <div className="space-y-4">
      <Link href="/reuniones" className="text-xs text-gray-500 hover:text-cyan-300">← Reuniones</Link>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <input
          className="input font-display text-lg font-bold flex-1 min-w-[200px]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save()}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save()} disabled={saving} className="btn-secondary text-sm">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={extractTasks} disabled={extracting} className="btn-primary text-sm">
            {extracting ? 'Leyendo notas…' : '✨ Extraer tareas'}
          </button>
          <button type="button" onClick={exportPdf} className="btn-secondary text-sm">📄 Exportar PDF</button>
          <button type="button" onClick={deleteMeeting} className="btn-danger text-sm">Eliminar</button>
        </div>
      </div>

      {meeting.company && (
        <span
          className="inline-block text-xs px-2.5 py-1 rounded-full border"
          style={{ borderColor: `${meeting.company.color}50`, color: meeting.company.color, backgroundColor: `${meeting.company.color}15` }}
        >
          {meeting.company.emoji} {meeting.company.name}
        </span>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Page tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActivePageIdx(i)}
            className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ${
              i === activePageIdx ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-[var(--bg-border)] text-slate-400 hover:text-slate-200'
            }`}
          >
            {p.type === 'mindmap' ? '🧠' : '📝'} {p.title}
            {pages.length > 1 && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); deletePage(i) }}
                className="ml-1 text-slate-500 hover:text-red-400"
              >
                ×
              </span>
            )}
          </button>
        ))}
        <div className="relative shrink-0">
          <button type="button" onClick={() => setAddMenuOpen((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-[var(--bg-border)] text-slate-400 hover:text-cyan-300">
            + Página
          </button>
          {addMenuOpen && (
            <div className="absolute z-10 mt-1 w-44 rounded-lg border border-[var(--bg-border)] bg-[var(--bg-elevated)] shadow-lg overflow-hidden">
              <button type="button" onClick={() => addPage('ink')} className="w-full text-left text-xs px-3 py-2 hover:bg-[var(--bg-hover)]">📝 Lienzo de notas</button>
              <button type="button" onClick={() => addPage('mindmap')} className="w-full text-left text-xs px-3 py-2 hover:bg-[var(--bg-hover)]">🧠 Mapa mental</button>
            </div>
          )}
        </div>
      </div>

      {activePage?.type === 'ink' && (
        <InkCanvas
          ref={inkRef}
          strokes={activePage.strokes}
          textBoxes={activePage.textBoxes}
          shapes={activePage.shapes ?? []}
          onChangeStrokes={(strokes) => updatePage(activePageIdx, { ...activePage, strokes })}
          onChangeTextBoxes={(textBoxes) => updatePage(activePageIdx, { ...activePage, textBoxes })}
          onChangeShapes={(shapes) => updatePage(activePageIdx, { ...activePage, shapes })}
        />
      )}
      {activePage?.type === 'mindmap' && (
        <MindMapCanvas ref={mapRef} page={activePage} onChange={(page) => updatePage(activePageIdx, page)} />
      )}

      {meeting.summary && (
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Resumen (IA)</p>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{meeting.summary}</p>
        </div>
      )}

      {meeting.tasks.length > 0 && (
        <div className="card">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
            Tareas extraídas {meeting.company && '· también en el tablero de la empresa'}
          </p>
          <div className="space-y-2">
            {meeting.tasks.map((t) => (
              <label key={t.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={(e) => toggleTask(t.id, e.target.checked)}
                  className="w-4 h-4 rounded accent-cyan-500"
                />
                <span className={t.done ? 'line-through text-gray-600' : 'text-gray-200'}>{t.title}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
