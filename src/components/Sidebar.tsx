'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'

const tradingItems = [
  { label: 'Diario', href: '/trading/diario' },
  { label: 'Checklist', href: '/trading/checklist' },
  { label: 'Calculadora', href: '/trading/calculadora' },
  { label: 'Playbook', href: '/trading/playbook' },
  { label: 'Estadísticas', href: '/trading/estadisticas' },
]

const mainNavItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/habitos',
    label: 'Hábitos',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/agenda',
    label: 'Agenda',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/journal',
    label: 'Journal',
    icon: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [tradingOpen, setTradingOpen] = useState(pathname.startsWith('/trading'))
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  const navLink = (href: string, label: string, icon: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
        isActive(href)
          ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
          : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
      }`}
    >
      {icon}
      {label}
    </Link>
  )

  const sidebarContent = (
    <>
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
          {/* Close button — mobile only */}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto lg:hidden text-gray-500 hover:text-gray-300 p-1"
            aria-label="Cerrar menú"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navLink('/dashboard', 'Dashboard', mainNavItems[0].icon)}

        {/* Trading dropdown */}
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

        {navLink('/habitos', 'Hábitos', mainNavItems[1].icon)}
        {navLink('/agenda', 'Agenda', mainNavItems[2].icon)}
        {navLink('/journal', 'Journal', mainNavItems[3].icon)}
      </nav>

      {/* Sign out */}
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
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#111] border-b border-[#2a2a2a] flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-gray-400 hover:text-white p-1"
          aria-label="Abrir menú"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600/20 border border-blue-600/40 rounded flex items-center justify-center">
            <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 16l4-4 4 4 4-6" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm">Marin Systems</span>
        </div>
      </header>

      {/* Overlay — mobile */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 h-full w-64 bg-[#111] border-r border-[#2a2a2a] flex flex-col z-50
          transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:w-60
        `}
      >
        {sidebarContent}
      </aside>

      {/* Bottom nav — mobile only */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111] border-t border-[#2a2a2a] flex">
        {mainNavItems.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors ${
              isActive(href) ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {icon}
            {label}
          </Link>
        ))}
        <Link
          href="/trading/diario"
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors ${
            pathname.startsWith('/trading') ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          Trading
        </Link>
      </nav>
    </>
  )
}
