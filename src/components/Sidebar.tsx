'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const tradingItems = [
  { label: 'Diario', href: '/trading/diario' },
  { label: 'Checklist', href: '/trading/checklist' },
  { label: 'Calculadora', href: '/trading/calculadora' },
  { label: 'Playbook', href: '/trading/playbook' },
  { label: 'Estadísticas', href: '/trading/estadisticas' },
  { label: 'Resumen Semanal', href: '/trading/resumen' },
]

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const [tradingOpen, setTradingOpen] = useState(pathname.startsWith('/trading'))
  const [activeCompanies, setActiveCompanies] = useState<number | null>(null)
  const [showCompanyTooltip, setShowCompanyTooltip] = useState(false)

  const isActive = (href: string) => pathname === href

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data: Array<{ status: string }>) => {
        if (Array.isArray(data)) {
          setActiveCompanies(data.filter((c) => c.status === 'activa').length)
        }
      })
      .catch(() => {})
  }, [])

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
        : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
    }`

  return (
    <aside className="h-full w-60 bg-[#111] border-r border-[#2a2a2a] flex flex-col">
      {/* Brand */}
      <div className="p-5 border-b border-[#2a2a2a] flex items-center justify-between">
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
        {onClose && (
          <button onClick={onClose} className="text-gray-600 hover:text-gray-400 md:hidden">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold px-3 pt-1 pb-0.5">Negocios</p>

        {/* Empresas */}
        <div className="relative">
          <Link
            href="/empresas"
            onClick={onClose}
            onMouseEnter={() => setShowCompanyTooltip(true)}
            onMouseLeave={() => setShowCompanyTooltip(false)}
            className={linkClass(pathname.startsWith('/empresas'))}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Empresas
            {activeCompanies !== null && activeCompanies > 0 && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/20 text-blue-400 font-medium">
                {activeCompanies}
              </span>
            )}
          </Link>
          {showCompanyTooltip && activeCompanies !== null && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-gray-300 whitespace-nowrap z-50 shadow-xl pointer-events-none">
              {activeCompanies} empresa{activeCompanies !== 1 ? 's' : ''} activa{activeCompanies !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="pt-2">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold px-3 pb-0.5">Personal</p>
        </div>

        {/* Dashboard */}
        <Link href="/dashboard" onClick={onClose} className={linkClass(pathname === '/dashboard')}>
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
                  onClick={onClose}
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
        <Link href="/habitos" onClick={onClose} className={linkClass(pathname.startsWith('/habitos'))}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Hábitos
        </Link>

        {/* Agenda */}
        <Link href="/agenda" onClick={onClose} className={linkClass(pathname.startsWith('/agenda'))}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Agenda
        </Link>

        {/* Journal */}
        <Link href="/journal" onClick={onClose} className={linkClass(pathname.startsWith('/journal'))}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Journal
        </Link>

        {/* Configuración */}
        <Link href="/configuracion" onClick={onClose} className={linkClass(pathname.startsWith('/configuracion'))}>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Configuración
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

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block fixed left-0 top-0 h-full w-60 z-30">
        <SidebarContent />
      </div>

      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 w-9 h-9 rounded-lg bg-[#111] border border-[#2a2a2a] flex items-center justify-center text-gray-400 hover:text-gray-200"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/60 z-40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="md:hidden fixed left-0 top-0 h-full w-60 z-50"
            >
              <SidebarContent onClose={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
