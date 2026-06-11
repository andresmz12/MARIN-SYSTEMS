'use client'

import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    const initial = saved ?? (document.documentElement.classList.contains('light') ? 'light' : 'dark')
    setTheme(initial)
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    if (next === 'light') {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
  }

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-[var(--bg-hover)]"
      style={{ color: 'var(--text-secondary)' }}
    >
      <span className="w-4 h-4 flex-shrink-0 text-base leading-none">
        {theme === 'dark' ? '🌙' : '☀️'}
      </span>
      <span className="hidden lg:inline">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
    </button>
  )
}
