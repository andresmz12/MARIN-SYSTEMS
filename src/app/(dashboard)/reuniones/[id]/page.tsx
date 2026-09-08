'use client'

import { useEffect, useRef, useState, use as usePromise } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import jsPDF from 'jspdf'
import { InkCanvas, InkCanvasHandle, Stroke } from '@/components/meetings/InkCanvas'
import { formatDateTime } from '@/lib/utils'

interface CompanyLite { id: string; name: string; color: string; emoji: string }
interface MeetingTaskItem { id: string; title: string; done: boolean }
interface MeetingDetail {
  id: string
  title: string
  date: string
  strokes: Stroke[]
  summary: string | null
  company: CompanyLite | null
  tasks: MeetingTaskItem[]
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const router = useRouter()
  const canvasRef = useRef<InkCanvasHandle>(null)

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        setStrokes(data.strokes ?? [])
        setTitle(data.title)
      }
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      await fetch(`/api/meetings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, strokes }),
      })
    } finally {
      setSaving(false)
    }
  }

  async function extractTasks() {
    setError(null)
    setExtracting(true)
    try {
      await save()
      const imageBase64 = canvasRef.current?.exportPng()
      if (!imageBase64) return
      const res = await fetch(`/api/meetings/${id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
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

  function exportPdf() {
    if (!meeting) return
    const imageBase64 = canvasRef.current?.exportPng()
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

    if (imageBase64) {
      if (y > 550) { doc.addPage(); y = 40 }
      doc.setFontSize(13)
      doc.setTextColor(20)
      doc.text('Notas manuscritas', 40, y)
      y += 12
      const imgW = pageWidth - 80
      const imgH = imgW * (1360 / 1000)
      doc.addImage(imageBase64, 'PNG', 40, y, imgW, imgH)
    }

    doc.save(`reunion-${(title || 'sin-titulo').toLowerCase().replace(/\s+/g, '-')}.pdf`)
  }

  if (loading) return <div className="h-96 bg-[var(--bg-elevated)] animate-pulse rounded-xl" />
  if (!meeting) return <p className="text-sm text-gray-500">Reunión no encontrada.</p>

  return (
    <div className="space-y-4">
      <Link href="/reuniones" className="text-xs text-gray-500 hover:text-cyan-300">← Reuniones</Link>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <input
          className="input font-display text-lg font-bold flex-1 min-w-[200px]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={saving} className="btn-secondary text-sm">
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

      <InkCanvas ref={canvasRef} value={strokes} onChange={setStrokes} />

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
