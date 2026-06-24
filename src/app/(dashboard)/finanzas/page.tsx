'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── COP formatter ───────────────────────────────────────────────────────────
const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})
function fmt(n: number) {
  return cop.format(n)
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface FinanceAccount {
  id: string; name: string; type: string; balance: number
}
interface CreditCard {
  id: string; name: string; creditLimit: number; usedAmount: number
  interestRate: number; cutoffDay: number; paymentDay: number
}
interface Debt {
  id: string; name: string; originalAmount: number; remainingAmount: number
  interestRate: number; monthlyPayment: number; startDate: string; status: string
}
interface FinanceCategory {
  id: string; name: string; type: string; emoji: string
}
interface FinanceTransaction {
  id: string; date: string; amount: number; type: string
  note: string | null; isRecurring: boolean
  category?: FinanceCategory | null
}
interface Summary {
  month: string; totalIncome: number; totalExpenses: number; netBalance: number
  totalAccountBalance: number; totalCardDebt: number; totalDebtRemaining: number
  byCategory: { name: string; emoji: string; amount: number }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const TABS = ['Resumen', 'Cuentas', 'Tarjetas', 'Deudas', 'Transacciones', 'Presupuesto'] as const
type Tab = typeof TABS[number]

// ─── Small generic modal ──────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Field ───────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
const inputCls = 'w-full bg-[var(--bg-input)] border border-[var(--bg-border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500'
const btnPrimary = 'w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors'

// ─── Accounts tab ────────────────────────────────────────────────────────────
function AccountsTab() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'banco', balance: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/finance/accounts')
    if (r.ok) setAccounts(await r.json())
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, balance: Number(form.balance) || 0 }),
    })
    setForm({ name: '', type: 'banco', balance: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar cuenta?')) return
    await fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' })
    load()
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Balance total</p>
          <p className="text-2xl font-bold text-white">{fmt(totalBalance)}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors">
          + Cuenta
        </button>
      </div>

      <div className="grid gap-3">
        {accounts.map(a => (
          <div key={a.id} className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{a.name}</p>
              <p className="text-xs text-gray-500 capitalize">{a.type}</p>
            </div>
            <div className="flex items-center gap-4">
              <p className={`font-semibold ${a.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(a.balance)}</p>
              <button onClick={() => del(a.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Eliminar</button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <p className="text-gray-500 text-sm">No hay cuentas todavía.</p>}
      </div>

      {showForm && (
        <Modal title="Nueva cuenta" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Nombre"><input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></Field>
            <Field label="Tipo">
              <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="banco">Banco</option>
                <option value="efectivo">Efectivo</option>
                <option value="ahorros">Ahorros</option>
              </select>
            </Field>
            <Field label="Saldo inicial (COP)"><input className={inputCls} type="number" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} /></Field>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando…' : 'Crear cuenta'}</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Cards tab ───────────────────────────────────────────────────────────────
function CardsTab() {
  const [cards, setCards] = useState<CreditCard[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', creditLimit: '', usedAmount: '', interestRate: '', cutoffDay: '', paymentDay: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/finance/cards')
    if (r.ok) setCards(await r.json())
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/finance/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        creditLimit: Number(form.creditLimit),
        usedAmount: Number(form.usedAmount) || 0,
        interestRate: Number(form.interestRate) || 0,
        cutoffDay: Number(form.cutoffDay),
        paymentDay: Number(form.paymentDay),
      }),
    })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar tarjeta?')) return
    await fetch(`/api/finance/cards/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors">
          + Tarjeta
        </button>
      </div>

      <div className="grid gap-3">
        {cards.map(c => {
          const pct = c.creditLimit > 0 ? (c.usedAmount / c.creditLimit) * 100 : 0
          return (
            <div key={c.id} className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-xs text-gray-500">Corte día {c.cutoffDay} · Pago día {c.paymentDay}</p>
                </div>
                <button onClick={() => del(c.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Eliminar</button>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Usado: <span className="text-white">{fmt(c.usedAmount)}</span></span>
                <span className="text-gray-400">Límite: <span className="text-white">{fmt(c.creditLimit)}</span></span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{pct.toFixed(1)}% utilizado</p>
            </div>
          )
        })}
        {cards.length === 0 && <p className="text-gray-500 text-sm">No hay tarjetas todavía.</p>}
      </div>

      {showForm && (
        <Modal title="Nueva tarjeta" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Nombre"><input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></Field>
            <Field label="Límite (COP)"><input className={inputCls} type="number" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} required /></Field>
            <Field label="Saldo utilizado actual (COP)"><input className={inputCls} type="number" value={form.usedAmount} onChange={e => setForm(f => ({ ...f, usedAmount: e.target.value }))} /></Field>
            <Field label="Tasa de interés (%)"><input className={inputCls} type="number" step="0.01" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día de corte"><input className={inputCls} type="number" min="1" max="31" value={form.cutoffDay} onChange={e => setForm(f => ({ ...f, cutoffDay: e.target.value }))} required /></Field>
              <Field label="Día de pago"><input className={inputCls} type="number" min="1" max="31" value={form.paymentDay} onChange={e => setForm(f => ({ ...f, paymentDay: e.target.value }))} required /></Field>
            </div>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando…' : 'Crear tarjeta'}</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Debts tab ───────────────────────────────────────────────────────────────
function DebtsTab() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', originalAmount: '', remainingAmount: '', interestRate: '', monthlyPayment: '', startDate: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/finance/debts')
    if (r.ok) setDebts(await r.json())
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/finance/debts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        originalAmount: Number(form.originalAmount),
        remainingAmount: Number(form.remainingAmount),
        interestRate: Number(form.interestRate) || 0,
        monthlyPayment: Number(form.monthlyPayment) || 0,
        startDate: form.startDate,
      }),
    })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function markPaid(id: string) {
    await fetch(`/api/finance/debts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid', remainingAmount: 0 }),
    })
    load()
  }

  const activeDebts = debts.filter(d => d.status === 'active')
  const totalRemaining = activeDebts.reduce((s, d) => s + d.remainingAmount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Deuda total activa</p>
          <p className="text-2xl font-bold text-red-400">{fmt(totalRemaining)}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors">
          + Deuda
        </button>
      </div>

      <div className="grid gap-3">
        {debts.map(d => {
          const pct = d.originalAmount > 0 ? ((d.originalAmount - d.remainingAmount) / d.originalAmount) * 100 : 100
          return (
            <div key={d.id} className={`bg-[var(--bg-card)] border rounded-xl p-4 ${d.status === 'paid' ? 'border-emerald-800/40 opacity-60' : 'border-[var(--bg-border)]'}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-white">{d.name} {d.status === 'paid' && <span className="text-xs text-emerald-400 ml-1">✓ Pagada</span>}</p>
                  <p className="text-xs text-gray-500">{d.interestRate}% EA · Cuota {fmt(d.monthlyPayment)}/mes</p>
                </div>
                {d.status === 'active' && (
                  <button onClick={() => markPaid(d.id)} className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors">Marcar pagada</button>
                )}
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Restante: <span className="text-red-400">{fmt(d.remainingAmount)}</span></span>
                <span className="text-gray-400">Original: <span className="text-white">{fmt(d.originalAmount)}</span></span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{pct.toFixed(1)}% pagado</p>
            </div>
          )
        })}
        {debts.length === 0 && <p className="text-gray-500 text-sm">No hay deudas registradas.</p>}
      </div>

      {showForm && (
        <Modal title="Nueva deuda" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Nombre / entidad"><input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></Field>
            <Field label="Monto original (COP)"><input className={inputCls} type="number" value={form.originalAmount} onChange={e => setForm(f => ({ ...f, originalAmount: e.target.value }))} required /></Field>
            <Field label="Saldo restante (COP)"><input className={inputCls} type="number" value={form.remainingAmount} onChange={e => setForm(f => ({ ...f, remainingAmount: e.target.value }))} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tasa EA (%)"><input className={inputCls} type="number" step="0.01" value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} /></Field>
              <Field label="Cuota mensual"><input className={inputCls} type="number" value={form.monthlyPayment} onChange={e => setForm(f => ({ ...f, monthlyPayment: e.target.value }))} /></Field>
            </div>
            <Field label="Fecha inicio"><input className={inputCls} type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required /></Field>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando…' : 'Registrar deuda'}</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Transactions tab ─────────────────────────────────────────────────────────
function TransactionsTab({ month }: { month: string }) {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [cards, setCards] = useState<CreditCard[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    type: 'expense',
    categoryId: '',
    accountId: '',
    creditCardId: '',
    note: '',
    isRecurring: false,
  })

  const load = useCallback(async () => {
    const [tr, cat, acc, crd] = await Promise.all([
      fetch(`/api/finance/transactions?month=${month}`).then(r => r.json()),
      fetch('/api/finance/categories').then(r => r.json()),
      fetch('/api/finance/accounts').then(r => r.json()),
      fetch('/api/finance/cards').then(r => r.json()),
    ])
    setTransactions(Array.isArray(tr) ? tr : [])
    setCategories(Array.isArray(cat) ? cat : [])
    setAccounts(Array.isArray(acc) ? acc : [])
    setCards(Array.isArray(crd) ? crd : [])
  }, [month])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body: Record<string, unknown> = {
      date: form.date,
      amount: Number(form.amount),
      type: form.type,
      isRecurring: form.isRecurring,
    }
    if (form.categoryId) body.categoryId = form.categoryId
    if (form.accountId) body.accountId = form.accountId
    if (form.creditCardId) body.creditCardId = form.creditCardId
    if (form.note) body.note = form.note
    await fetch('/api/finance/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function del(id: string) {
    if (!confirm('¿Eliminar transacción?')) return
    await fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors">
          + Transacción
        </button>
      </div>

      <div className="space-y-2">
        {transactions.map(t => (
          <div key={t.id} className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">{t.category?.emoji ?? '📦'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{t.note ?? t.category?.name ?? 'Sin categoría'}</p>
              <p className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString('es-CO')} · {t.category?.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className={`font-semibold text-sm ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
              </p>
              <button onClick={() => del(t.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">×</button>
            </div>
          </div>
        ))}
        {transactions.length === 0 && <p className="text-gray-500 text-sm">No hay transacciones este mes.</p>}
      </div>

      {showForm && (
        <Modal title="Nueva transacción" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="expense">Gasto</option>
                  <option value="income">Ingreso</option>
                </select>
              </Field>
              <Field label="Fecha"><input className={inputCls} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required /></Field>
            </div>
            <Field label="Monto (COP)"><input className={inputCls} type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required /></Field>
            <Field label="Categoría">
              <select className={inputCls} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                <option value="">Sin categoría</option>
                {categories.filter(c => c.type === form.type).map(c => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Cuenta">
              <select className={inputCls} value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value, creditCardId: '' }))}>
                <option value="">Sin cuenta</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            {form.type === 'expense' && (
              <Field label="Tarjeta de crédito">
                <select className={inputCls} value={form.creditCardId} onChange={e => setForm(f => ({ ...f, creditCardId: e.target.value, accountId: '' }))}>
                  <option value="">Sin tarjeta</option>
                  {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Nota"><input className={inputCls} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></Field>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" checked={form.isRecurring} onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))} className="rounded" />
              Recurrente
            </label>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando…' : 'Registrar'}</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Budget tab ───────────────────────────────────────────────────────────────
function BudgetTab({ month }: { month: string }) {
  const [budgets, setBudgets] = useState<Array<{ id: string; plannedAmount: number; category: FinanceCategory }>>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ categoryId: '', plannedAmount: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [b, c, t] = await Promise.all([
      fetch(`/api/finance/budgets?month=${month}`).then(r => r.json()),
      fetch('/api/finance/categories').then(r => r.json()),
      fetch(`/api/finance/transactions?month=${month}&type=expense`).then(r => r.json()),
    ])
    setBudgets(Array.isArray(b) ? b : [])
    setCategories(Array.isArray(c) ? c.filter((x: FinanceCategory) => x.type === 'expense') : [])
    setTransactions(Array.isArray(t) ? t : [])
  }, [month])

  useEffect(() => { load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/finance/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: form.categoryId, month, plannedAmount: Number(form.plannedAmount) }),
    })
    setShowForm(false)
    setSaving(false)
    load()
  }

  function spentForCategory(catId: string) {
    return transactions
      .filter(t => t.category?.id === catId)
      .reduce((s, t) => s + t.amount, 0)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors">
          + Presupuesto
        </button>
      </div>

      <div className="grid gap-3">
        {budgets.map(b => {
          const spent = spentForCategory(b.category.id)
          const pct = b.plannedAmount > 0 ? (spent / b.plannedAmount) * 100 : 0
          return (
            <div key={b.id} className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-white">{b.category.emoji} {b.category.name}</p>
                <p className="text-sm text-gray-400">{fmt(spent)} / {fmt(b.plannedAmount)}</p>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{pct.toFixed(1)}% ejecutado</p>
            </div>
          )
        })}
        {budgets.length === 0 && <p className="text-gray-500 text-sm">No hay presupuestos para este mes.</p>}
      </div>

      {showForm && (
        <Modal title="Nuevo presupuesto" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Categoría">
              <select className={inputCls} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} required>
                <option value="">Seleccionar…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </Field>
            <Field label={`Monto planeado ${month} (COP)`}>
              <input className={inputCls} type="number" value={form.plannedAmount} onChange={e => setForm(f => ({ ...f, plannedAmount: e.target.value }))} required />
            </Field>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando…' : 'Guardar presupuesto'}</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─── Summary tab ──────────────────────────────────────────────────────────────
function SummaryTab({ month }: { month: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
    setSummary(null)
    fetch(`/api/finance/summary?month=${month}`)
      .then(r => r.json())
      .then(data => {
        if (data && Array.isArray(data.byCategory)) setSummary(data)
        else setError(true)
      })
      .catch(() => setError(true))
  }, [month])

  if (error) return <p className="text-gray-500 text-sm">No se pudo cargar el resumen. Intenta recargar la página.</p>
  if (!summary) return <p className="text-gray-500 text-sm">Cargando resumen…</p>

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { label: 'Ingresos', value: summary.totalIncome, color: 'text-emerald-400' },
          { label: 'Gastos', value: summary.totalExpenses, color: 'text-red-400' },
          { label: 'Neto del mes', value: summary.netBalance, color: summary.netBalance >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Balance en cuentas', value: summary.totalAccountBalance, color: 'text-blue-400' },
          { label: 'Deuda en tarjetas', value: summary.totalCardDebt, color: 'text-amber-400' },
          { label: 'Deudas activas', value: summary.totalDebtRemaining, color: 'text-red-400' },
        ].map(k => (
          <div key={k.label} className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-lg font-bold ${k.color}`}>{fmt(k.value)}</p>
          </div>
        ))}
      </div>

      {/* Spending by category */}
      {summary.byCategory.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Gastos por categoría</h3>
          <div className="space-y-2">
            {summary.byCategory.map(cat => {
              const pct = summary.totalExpenses > 0 ? (cat.amount / summary.totalExpenses) * 100 : 0
              return (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="text-lg w-6 text-center">{cat.emoji}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{cat.name}</span>
                      <span className="text-white">{fmt(cat.amount)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FinanzasPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Resumen')
  const [month, setMonth] = useState(currentMonth)

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Finanzas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Control de tus finanzas personales</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--bg-border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-[var(--bg-hover)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'Resumen' && <SummaryTab month={month} />}
        {activeTab === 'Cuentas' && <AccountsTab />}
        {activeTab === 'Tarjetas' && <CardsTab />}
        {activeTab === 'Deudas' && <DebtsTab />}
        {activeTab === 'Transacciones' && <TransactionsTab month={month} />}
        {activeTab === 'Presupuesto' && <BudgetTab month={month} />}
      </div>
    </div>
  )
}
