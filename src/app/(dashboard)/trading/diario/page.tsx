'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'

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
}

const PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'GBP/JPY', 'EUR/JPY', 'XAU/USD']
const SETUPS = ['London Breakout', 'NY Session Open', 'Estructura H4', 'Rebote soporte/resistencia', 'Fibonacci', 'Price Action', 'Otro']
const EMOTIONS = ['Tranquilo', 'Ansioso', 'Confiado', 'Dudoso', 'Emocionado', 'Frustrado', 'Neutral']

const emptyForm = {
  pair: 'EUR/USD',
  result: 'win' as string,
  pips: '',
  setup: '',
  emotion: '',
  followedPlan: true,
  notes: '',
  date: new Date().toISOString().split('T')[0],
}

export default function TradingDiarioPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editTrade, setEditTrade] = useState<Trade | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [filterResult, setFilterResult] = useState('')
  const [filterPair, setFilterPair] = useState('')
  const [filterDate, setFilterDate] = useState('')

  useEffect(() => {
    loadTrades()
  }, [filterResult, filterPair, filterDate])

  async function loadTrades() {
    const params = new URLSearchParams()
    if (filterResult) params.set('result', filterResult)
    if (filterPair) params.set('pair', filterPair)
    if (filterDate) params.set('date', filterDate)
    const res = await fetch(`/api/trades?${params}`)
    if (res.ok) setTrades(await res.json())
  }

  const last3 = trades.slice(0, 3)
  const threeStrikes = last3.length === 3 && last3.every((t) => t.result === 'loss')

  function openCreate() {
    setEditTrade(null)
    setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] })
    setModalOpen(true)
  }

  function openEdit(trade: Trade) {
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
    })
    setModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = { ...form, pips: form.pips ? parseFloat(form.pips) : null }

    if (editTrade) {
      await fetch(`/api/trades/${editTrade.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } else {
      await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    setLoading(false)
    setModalOpen(false)
    loadTrades()
  }

  async function deleteTrade(id: string) {
    if (!confirm('¿Eliminar este trade?')) return
    await fetch(`/api/trades/${id}`, { method: 'DELETE' })
    loadTrades()
  }

  const wins = trades.filter((t) => t.result === 'win').length
  const losses = trades.filter((t) => t.result === 'loss').length
  const winRate = trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0
  const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0)

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

      {/* 3 Strikes Alert */}
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

      {/* Quick Stats */}
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

      {/* Filters */}
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
              type="text"
              className="input"
              placeholder="EUR/USD..."
              value={filterPair}
              onChange={(e) => setFilterPair(e.target.value)}
            />
          </div>
          {(filterDate || filterResult || filterPair) && (
            <div className="flex items-end">
              <button
                onClick={() => { setFilterDate(''); setFilterResult(''); setFilterPair('') }}
                className="btn-secondary"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Trades Table */}
      <div className="card p-0 overflow-hidden">
        {trades.length === 0 ? (
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
                      {trade.followedPlan ? (
                        <span className="text-green-400 text-xs">✓ Sí</span>
                      ) : (
                        <span className="text-red-400 text-xs">✗ No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(trade)}
                          className="text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteTrade(trade.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTrade ? 'Editar Trade' : 'Registrar Trade'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Par de divisas</label>
              <select
                className="input"
                value={form.pair}
                onChange={(e) => setForm({ ...form, pair: e.target.value })}
              >
                {PAIRS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Resultado</label>
              <div className="flex gap-2">
                {['win', 'loss', 'be'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm({ ...form, result: r })}
                    className={`flex-1 py-2 rounded text-xs font-bold uppercase transition-colors border ${
                      form.result === r
                        ? r === 'win' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                          : r === 'loss' ? 'bg-red-500/20 text-red-400 border-red-500/40'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/40'
                        : 'bg-[#111] text-gray-600 border-[#2a2a2a]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Pips</label>
              <input
                type="number"
                step="0.1"
                className="input"
                placeholder="Ej: 25.5 o -10"
                value={form.pips}
                onChange={(e) => setForm({ ...form, pips: e.target.value })}
              />
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
              <input
                type="checkbox"
                checked={form.followedPlan}
                onChange={(e) => setForm({ ...form, followedPlan: e.target.checked })}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-sm text-gray-300">Seguí mi plan de trading</span>
            </label>
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Observaciones del trade..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
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
    </div>
  )
}
