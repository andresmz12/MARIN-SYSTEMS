'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
]

const tradingItems = [
  { label: 'Diario', href: '/trading/diario' },
  { label: 'Checklist', href: '/trading/checklist' },
  { label: 'Calculadora', href: '/trading/calculadora' },
  { label: 'Playbook', href: '/trading/playbook' },
  { label: 'Estadísticas', href: '/trading/estadisticas' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [tradingOpen, setTradingOpen] = useState(pathname.startsWith('/trading'))

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#111] border-r border-[#2a2a2a] flex flex-col z-30">
      {/* Brand */}
      <div className="p-5 border-b border-[#2a2a2a]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600/20 border border-blue-600/40 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 16l4-4 4 4 4-6" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-white text-sm tracking-tight">Marin Systems</span>
            <p className="text-[10px] text-gray-500">Trading & Productividad</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* Dashboard */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname === '/dashboard'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </Link>

        {/* Trading */}
        <div>
          <button
            onClick={() => setTradingOpen(!tradingOpen)}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              pathname.startsWith('/trading')
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
            }`}
          >
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              Trading
            </div>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${tradingOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {tradingOpen && (
            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[#2a2a2a] pl-3">
              {tradingItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-2 py-2 rounded-lg text-xs transition-colors ${
                    pathname === item.href
                      ? 'text-blue-400 bg-blue-600/10'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Hábitos */}
        <Link
          href="/habitos"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname.startsWith('/habitos')
              ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Hábitos
        </Link>

        {/* Agenda */}
        <Link
          href="/agenda"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname.startsWith('/agenda')
              ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Agenda
        </Link>

        {/* Journal */}
        <Link
          href="/journal"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname.startsWith('/journal')
              ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Journal
        </Link>
      </nav>

      {/* User / Sign out */}
      <div className="p-3 border-t border-[#2a2a2a]">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
