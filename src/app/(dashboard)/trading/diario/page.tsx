'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import { PAIRS, SETUPS, EMOTIONS } from '@/lib/constants'

interface Trade {
  id: string
  date: string
  pair: string
  result: string
  pips: number | null
  setup: string | null
  emotion: string | null
  followedPlan: boolean
  notes: string | null
  hasScreenshot: boolean
}

const emptyForm = {
  pair: 'EUR/USD',
  result: 'win' as string,
  pips: '',
  setup: '',
  emotion: '',
  followedPlan: true,
  notes: '',
  date: new Date().toISOString().split('T')[0],
  screenshot: null as string | null,
}

// Compress image with browser Canvas API — no dependencies needed
function compressImage(file: File, maxW = 1200, q = 0.75): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const c = document.createElement('canvas')
      c.width = img.width * scale
      c.height = img.height * scale
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', q))
    }
    img.src = URL.createObjectURL(file)
  })
}

export default function TradingDiarioPage() {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editTrade, setEditTrade] = useState<Trade | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [filterResult, setFilterResult] = useState('')
  const [filterPair, setFilterPair] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [imgLoading, setImgLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Paste image from clipboard while modal is open
  useEffect(() => {
    if (!modalOpen) return
    async function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
      if (!item) return
      const file = item.getAsFile()
      if (!file) return
      setImgLoading(true)
      try {
        const compressed = await compressImage(file)
        setForm(f => ({ ...f, screenshot: compressed }))
        await scanFile(file)
      } finally {
        setImgLoading(false)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen])

  useEffect(() => { loadTrades() }, [filterResult, filterPair, filterDate])

  async function loadTrades() {
    setPageLoading(true)
    setLoadError(false)
    try {
      const params = new URLSearchParams()
      if (filterResult) params.set('result', filterResult)
      if (filterPair)   params.set('pair', filterPair)
      if (filterDate)   params.set('date', filterDate)
      const res = await fetch(`/api/trades?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[trades] load failed:', res.status, body)
        throw new Error(res.status.toString())
      }
      setTrades(await res.json())
    } catch (err) {
      console.error('[trades] loadTrades error:', err)
      setLoadError(true)
    }
    setPageLoading(false)
  }

  const last3 = trades.slice(0, 3)
  const threeStrikes = last3.length === 3 && last3.every((t) => t.result === 'loss')

  function openCreate() {
    setEditTrade(null)
    setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] })
    setScanMsg(null)
    setModalOpen(true)
  }

  async function openEdit(trade: Trade) {
    // Fetch the full trade (including screenshot) before opening the modal
    let screenshot: string | null = null
    try {
      const res = await fetch(`/api/trades/${trade.id}`)
      if (res.ok) {
        const full = await res.json()
        screenshot = full.screenshot ?? null
      }
    } catch {
      // Non-blocking — open modal without screenshot if fetch fails
    }
    setEditTrade(trade)
    setForm({
      pair: trade.pair,
      result: trade.result,
      pips: trade.pips?.toString() || '',
      setup: trade.setup || '',
      emotion: trade.emotion || '',
      followedPlan: trade.followedPlan,
      notes: trade.notes || '',
      date: trade.date.split('T')[0],
      screenshot,
    })
    setScanMsg(null)
    setModalOpen(true)
  }

  async function scanExistingScreenshot() {
    if (!form.screenshot) return
    const res = await fetch(form.screenshot)
    const blob = await res.blob()
    await scanFile(new File([blob], 'screenshot.jpg', { type: blob.type || 'image/jpeg' }))
  }

  async function scanFile(file: File) {
    setScanning(true)
    setScanMsg(null)
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await fetch('/api/trades/scan', { method: 'POST', body: fd })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        setScanMsg({ ok: false, text: typeof data.error === 'string' ? data.error : 'Error al analizar' })
        return
      }
      setForm((prev) => ({
        ...prev,
        ...(typeof data.pair === 'string' && data.pair ? { pair: data.pair } : {}),
        ...(data.result === 'win' || data.result === 'loss' || data.result === 'be' ? { result: data.result } : {}),
        ...(typeof data.pips === 'number' ? { pips: String(data.pips) } : {}),
        ...(typeof data.date === 'string' && data.date ? { date: data.date } : {}),
        ...(typeof data.setup === 'string' && data.setup ? { setup: data.setup } : {}),
        ...(typeof data.notes === 'string' && data.notes ? { notes: data.notes } : {}),
      }))
      setScanMsg({ ok: true, text: 'Datos extraídos — revisa y confirma' })
    } catch {
      setScanMsg({ ok: false, text: 'Error de conexión' })
    } finally {
      setScanning(false)
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgLoading(true)
    try {
      const compressed = await compressImage(file)
      setForm(f => ({ ...f, screenshot: compressed }))
      await scanFile(file)
    } finally {
      setImgLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...form,
        pips: form.pips ? parseFloat(form.pips) : null,
        screenshot: form.screenshot ?? null,
      }
      const res = editTrade
        ? await fetch(`/api/trades/${editTrade.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/trades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) throw new Error()
      showToast(editTrade ? 'Trade actualizado' : 'Trade registrado', 'success')
      setModalOpen(false)
      loadTrades()
    } catch {
      showToast('Error al guardar el trade', 'error')
    }
    setLoading(false)
  }

  async function confirmDeleteTrade() {
    if (!confirmDelete) return
    try {
      await fetch(`/api/trades/${confirmDelete}`, { method: 'DELETE' })
      showToast('Trade eliminado', 'success')
      loadTrades()
    } catch {
      showToast('Error al eliminar', 'error')
    }
    setConfirmDelete(null)
  }

  const wins = trades.filter((t) => t.result === 'win').length
  const losses = trades.filter((t) => t.result === 'loss').length
  const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0
  const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0)

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <p className="text-gray-500">Error al cargar los trades</p>
        <button onClick={loadTrades} className="btn-primary">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Diario de Trading</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registro de todas tus operaciones</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar Trade
        </button>
      </div>

      {threeStrikes && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl">🛑</span>
          <div>
            <p className="font-semibold text-red-400">Regla de los 3 Strikes</p>
            <p className="text-sm text-red-300/80 mt-0.5">
              Has tenido 3 pérdidas consecutivas. Por tu plan de trading, debes dejar de operar por hoy. Protege tu capital.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500">Total trades</p>
          <p className="text-2xl font-bold text-white mt-1">{trades.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Win Rate</p>
          <p className={`text-2xl font-bold mt-1 ${winRate >= 55 ? 'text-green-400' : winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
            {winRate}%
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Total Pips</p>
          <p className={`text-2xl font-bold mt-1 ${totalPips >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPips > 0 ? '+' : ''}{Math.round(totalPips * 10) / 10}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">W/L</p>
          <p className="text-2xl font-bold text-white mt-1">{wins}/{losses}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-32">
            <label className="label">Fecha</label>
            <input type="date" className="input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </div>
          <div className="flex-1 min-w-32">
            <label className="label">Resultado</label>
            <select className="input" value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
              <option value="">Todos</option>
              <option value="win">WIN</option>
              <option value="loss">LOSS</option>
              <option value="be">BE</option>
            </select>
          </div>
          <div className="flex-1 min-w-32">
            <label className="label">Par</label>
            <input
              type="text" className="input" placeholder="EUR/USD..."
              value={filterPair} onChange={(e) => setFilterPair(e.target.value)}
            />
          </div>
          {(filterDate || filterResult || filterPair) && (
            <div className="flex items-end">
              <button onClick={() => { setFilterDate(''); setFilterResult(''); setFilterPair('') }} className="btn-secondary">
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {pageLoading ? (
          <div className="divide-y divide-[#1f1f1f]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4 animate-pulse">
                <div className="h-4 bg-[#2a2a2a] rounded w-20" />
                <div className="h-4 bg-[#2a2a2a] rounded w-16" />
                <div className="h-4 bg-[#2a2a2a] rounded w-12" />
                <div className="h-4 bg-[#2a2a2a] rounded w-8" />
                <div className="h-4 bg-[#2a2a2a] rounded w-28 ml-auto" />
              </div>
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-600 text-sm">No hay trades registrados</p>
            <button onClick={openCreate} className="btn-primary mt-3">Registrar primer trade</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">FECHA</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">PAR</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">RESULTADO</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">PIPS</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">SETUP</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">EMOCIÓN</th>
                  <th className="px-4 py-3 text-left text-xs text-gray-500 font-medium">PLAN</th>
                  <th className="px-4 py-3 text-right text-xs text-gray-500 font-medium">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f]">
                {trades.map((trade) => (
                  <tr key={trade.id} className="hover:bg-[#1f1f1f] transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(trade.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-200">{trade.pair}</td>
                    <td className="px-4 py-3">
                      <span className={`badge-${trade.result}`}>{trade.result.toUpperCase()}</span>
                    </td>
                    <td className={`px-4 py-3 font-medium ${(trade.pips || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pips !== null ? `${(trade.pips || 0) > 0 ? '+' : ''}${trade.pips}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{trade.setup || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{trade.emotion || '—'}</td>
                    <td className="px-4 py-3">
                      {trade.followedPlan
                        ? <span className="text-green-400 text-xs">✓ Sí</span>
                        : <span className="text-red-400 text-xs">✗ No</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Screenshot icon — fetches full trade on click */}
                        {trade.hasScreenshot && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/trades/${trade.id}`)
                                if (res.ok) {
                                  const full = await res.json()
                                  if (full.screenshot) setLightbox(full.screenshot)
                                }
                              } catch { /* ignore */ }
                            }}
                            className="text-cyan-400 hover:text-blue-300 transition-colors"
                            title="Ver captura de TradingView"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                        )}
                        <button onClick={() => openEdit(trade)} className="text-gray-500 hover:text-gray-300 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => setConfirmDelete(trade.id)} className="text-gray-600 hover:text-red-400 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTrade ? 'Editar Trade' : 'Registrar Trade'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <label className="label">Par de divisas</label>
              <select className="input" value={form.pair} onChange={(e) => setForm({ ...form, pair: e.target.value })}>
                {PAIRS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Resultado</label>
              <div className="flex gap-2">
                {['win', 'loss', 'be'].map((r) => (
                  <button key={r} type="button" onClick={() => setForm({ ...form, result: r })}
                    className={`flex-1 py-2 rounded text-xs font-bold uppercase transition-colors border ${
                      form.result === r
                        ? r === 'win' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                          : r === 'loss' ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/40'
                        : 'bg-[#111] text-gray-600 border-[#2a2a2a]'
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Pips</label>
              <input type="number" step="0.1" className="input" placeholder="Ej: 25.5 o -10"
                value={form.pips} onChange={(e) => setForm({ ...form, pips: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Setup</label>
              <select className="input" value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {SETUPS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Emoción al entrar</label>
              <select className="input" value={form.emotion} onChange={(e) => setForm({ ...form, emotion: e.target.value })}>
                <option value="">— Seleccionar —</option>
                {EMOTIONS.map((em) => <option key={em}>{em}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.followedPlan}
                onChange={(e) => setForm({ ...form, followedPlan: e.target.checked })}
                className="w-4 h-4 rounded accent-cyan-500" />
              <span className="text-sm text-gray-300">Seguí mi plan de trading</span>
            </label>
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input resize-none" rows={3} placeholder="Observaciones del trade..."
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {/* Screenshot upload — auto-fills form on upload/paste */}
          <div>
            <label className="label">Captura de TradingView</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />

            {form.screenshot ? (
              <div className="relative inline-block mt-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.screenshot}
                  alt="Captura TradingView"
                  className="rounded-lg border border-[#2a2a2a] object-cover cursor-pointer"
                  style={{ width: 180, height: 101 }}
                  onClick={() => !scanning && setLightbox(form.screenshot!)}
                />
                {scanning ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 rounded-lg">
                    <svg className="w-5 h-5 animate-spin text-cyan-300" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span className="text-[10px] text-blue-300">Analizando...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={scanExistingScreenshot}
                    className="absolute bottom-1 left-1 bg-cyan-500/90 hover:bg-cyan-400 text-white text-[10px] font-medium px-2 py-0.5 rounded transition-colors"
                    title="Analizar con IA para llenar el formulario"
                  >
                    ✦ Analizar
                  </button>
                )}
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => { setForm(f => ({ ...f, screenshot: null })); setScanMsg(null) }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 transition-colors disabled:opacity-50"
                  title="Quitar imagen"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={imgLoading}
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 w-full py-3 rounded-lg border border-dashed border-[#3a3a3a] text-gray-500 hover:text-gray-300 hover:border-[#555] transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {imgLoading ? 'Procesando...' : '📷 Adjuntar o pegar captura (Ctrl+V)'}
              </button>
            )}
            {scanMsg && (
              <p className={`text-xs mt-1.5 ${scanMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                {scanMsg.ok ? '✓ ' : '✗ '}{scanMsg.text}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Guardando...' : editTrade ? 'Actualizar' : 'Registrar'}
            </button>
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        title="Eliminar trade"
        message="¿Seguro que quieres eliminar este trade? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDeleteTrade}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Captura TradingView"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            style={{ maxHeight: '90vh', maxWidth: '95vw' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
