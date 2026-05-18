'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useToast } from '@/components/ui/Toast'

export default function ConfiguracionPage() {
  const { data: session, update: updateSession } = useSession()
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [localSaved, setLocalSaved] = useState(false)

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name)
    }
  }, [session?.user?.name])

  const handleSaveName = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        showToast(data.error ?? 'Error al guardar', 'error')
        return
      }

      await updateSession()
      showToast('Nombre actualizado correctamente', 'success')
      setLocalSaved(true)
      setTimeout(() => setLocalSaved(false), 2000)
    } catch {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración</h1>
        <p className="text-gray-500 text-sm mt-0.5">Gestiona tu perfil y preferencias</p>
      </div>

      {/* Perfil */}
      <section className="card space-y-4">
        <h2 className="text-base font-semibold text-white border-b border-[#2a2a2a] pb-3">
          Perfil
        </h2>

        <div>
          <label className="label">Email</label>
          <div className="input bg-[#0a0a0a] text-gray-500 cursor-not-allowed select-none">
            {session?.user?.email ?? '—'}
          </div>
          <p className="text-xs text-gray-600 mt-1">El email no se puede modificar.</p>
        </div>

        <div>
          <label htmlFor="name" className="label">Nombre</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            className="input"
            placeholder="Tu nombre"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSaveName}
            disabled={saving || !name.trim()}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {localSaved && (
            <span className="text-xs text-green-400 font-medium">✓ Guardado</span>
          )}
        </div>
      </section>

      {/* Sesión */}
      <section className="card space-y-4">
        <h2 className="text-base font-semibold text-white border-b border-[#2a2a2a] pb-3">
          Sesión
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300 font-medium">Cerrar sesión</p>
            <p className="text-xs text-gray-500 mt-0.5">Saldrás de tu cuenta en este dispositivo.</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="btn-danger"
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </div>
  )
}
