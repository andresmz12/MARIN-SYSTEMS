'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 bg-[var(--bg-base)]">
      <div className="text-5xl">⚠️</div>
      <div className="text-center space-y-2 max-w-md px-6">
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Algo salió mal</h1>
        <p className="text-sm text-gray-500 leading-relaxed">{error.message ?? 'Error inesperado en la aplicación'}</p>
        {error.digest && <p className="text-xs text-gray-600 font-mono">ID: {error.digest}</p>}
      </div>
      <button
        onClick={reset}
        className="btn-primary px-6 py-2.5"
      >
        Reintentar
      </button>
    </div>
  )
}
