'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'

interface SubGoal {
  id: string
  title: string
  completed: boolean
}

interface Goal {
  id: string
  title: string
  description: string | null
  deadline: string | null
  completed: boolean
  subGoals: SubGoal[]
}

const emptyGoalForm = { title: '', description: '', deadline: '' }

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [form, setForm] = useState(emptyGoalForm)
  const [saving, setSaving] = useState(false)

  // sub-goal input per goal
  const [subInputs, setSubInputs] = useState<Record<string, string>>({})

  async function loadGoals() {
    const res = await fetch('/api/goals')
    if (res.ok) setGoals(await res.json())
    setLoading(false)
  }

  useEffect(() => { loadGoals() }, [])

  function openCreate() {
    setEditGoal(null)
    setForm(emptyGoalForm)
    setModalOpen(true)
  }

  function openEdit(goal: Goal) {
    setEditGoal(goal)
    setForm({
      title: goal.title,
      description: goal.description ?? '',
      deadline: goal.deadline ? goal.deadline.split('T')[0] : '',
    })
    setModalOpen(true)
  }

  async function saveGoal() {
    if (!form.title.trim()) return
    setSaving(true)
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      deadline: form.deadline || null,
    }

    if (editGoal) {
      await fetch(`/api/goals/${editGoal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    setSaving(false)
    setModalOpen(false)
    loadGoals()
  }

  async function deleteGoal(id: string) {
    if (!confirm('¿Eliminar esta meta y todas sus submetas?')) return
    await fetch(`/api/goals/${id}`, { method: 'DELETE' })
    loadGoals()
  }

  async function toggleGoal(goal: Goal) {
    await fetch(`/api/goals/${goal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !goal.completed }),
    })
    loadGoals()
  }

  async function addSubGoal(goalId: string) {
    const title = (subInputs[goalId] ?? '').trim()
    if (!title) return
    await fetch(`/api/goals/${goalId}/subgoals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    setSubInputs(s => ({ ...s, [goalId]: '' }))
    loadGoals()
  }

  async function toggleSubGoal(goalId: string, sub: SubGoal) {
    await fetch(`/api/goals/${goalId}/subgoals/${sub.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !sub.completed }),
    })
    loadGoals()
  }

  async function deleteSubGoal(goalId: string, subId: string) {
    await fetch(`/api/goals/${goalId}/subgoals/${subId}`, { method: 'DELETE' })
    loadGoals()
  }

  const progress = (goal: Goal) => {
    if (!goal.subGoals.length) return goal.completed ? 100 : 0
    return Math.round((goal.subGoals.filter(s => s.completed).length / goal.subGoals.length) * 100)
  }

  const daysLeft = (deadline: string | null) => {
    if (!deadline) return null
    const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
    return diff
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Metas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {goals.filter(g => g.completed).length} de {goals.length} completadas
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva meta
        </button>
      </div>

      {/* Empty state */}
      {goals.length === 0 && (
        <div className="card text-center py-16">
          <div className="w-14 h-14 bg-blue-600/10 border border-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 21l1.9-5.7a8.5 8.5 0 113.8 3.8L3 21" />
            </svg>
          </div>
          <p className="text-gray-400 font-medium">Aún no tienes metas</p>
          <p className="text-gray-600 text-sm mt-1">Crea tu primera meta y divídela en submetas</p>
          <button onClick={openCreate} className="btn-primary mt-5 inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Crear primera meta
          </button>
        </div>
      )}

      {/* Goals list */}
      <div className="space-y-4">
        {goals.map(goal => {
          const pct = progress(goal)
          const days = daysLeft(goal.deadline)

          return (
            <div key={goal.id} className={`card space-y-4 ${goal.completed ? 'opacity-70' : ''}`}>
              {/* Goal header */}
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleGoal(goal)}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    goal.completed
                      ? 'bg-green-500 border-green-500'
                      : 'border-gray-600 hover:border-green-500'
                  }`}
                >
                  {goal.completed && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className={`font-semibold text-white truncate ${goal.completed ? 'line-through text-gray-500' : ''}`}>
                      {goal.title}
                    </h2>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(goal)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {goal.description && (
                    <p className="text-sm text-gray-500 mt-1">{goal.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {/* Progress */}
                    {goal.subGoals.length > 0 && (
                      <div className="flex items-center gap-2 flex-1 min-w-[120px]">
                        <div className="flex-1 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">{pct}%</span>
                      </div>
                    )}

                    {/* Deadline */}
                    {days !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        days < 0
                          ? 'bg-red-500/10 text-red-400'
                          : days <= 7
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-[#1a1a1a] text-gray-500'
                      }`}>
                        {days < 0 ? `Venció hace ${Math.abs(days)}d` : days === 0 ? 'Hoy' : `${days}d restantes`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sub-goals */}
              {goal.subGoals.length > 0 && (
                <div className="ml-8 space-y-1.5">
                  {goal.subGoals.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => toggleSubGoal(goal.id, sub)}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          sub.completed
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-600 hover:border-blue-500'
                        }`}
                      >
                        {sub.completed && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={`text-sm flex-1 ${sub.completed ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                        {sub.title}
                      </span>
                      <button
                        onClick={() => deleteSubGoal(goal.id, sub.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-600 hover:text-red-400 transition-all"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add sub-goal input */}
              {!goal.completed && (
                <div className="ml-8 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Agregar submeta..."
                    value={subInputs[goal.id] ?? ''}
                    onChange={e => setSubInputs(s => ({ ...s, [goal.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addSubGoal(goal.id)}
                    className="flex-1 bg-transparent text-sm text-gray-400 placeholder-gray-600 border-b border-[#2a2a2a] focus:border-blue-500 focus:outline-none py-1 transition-colors"
                  />
                  <button
                    onClick={() => addSubGoal(goal.id)}
                    className="p-1 rounded text-gray-600 hover:text-blue-400 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Create / Edit modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}>
        <h2 className="text-lg font-bold text-white mb-5">
          {editGoal ? 'Editar meta' : 'Nueva meta'}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="label">Título *</label>
            <input
              className="input"
              placeholder="Ej: Alcanzar consistencia en trading"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && saveGoal()}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Describe tu meta en detalle..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Fecha límite</label>
            <input
              type="date"
              className="input"
              value={form.deadline}
              onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
            Cancelar
          </button>
          <button onClick={saveGoal} disabled={saving || !form.title.trim()} className="btn-primary flex-1">
            {saving ? 'Guardando...' : editGoal ? 'Guardar' : 'Crear meta'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
