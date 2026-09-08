'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

const tradingItems = [
  { label: 'Mi Sistema', href: '/trading/sistema' },
  { label: 'Diario', href: '/trading/diario' },
  { label: 'Calculadora', href: '/trading/calculadora' },
  { label: 'Estadísticas', href: '/trading/estadisticas' },
  { label: 'Resumen Semanal', href: '/trading/resumen' },
]

const personalItems = [
  { label: 'Hábitos', href: '/habitos' },
  { label: 'Agenda', href: '/agenda' },
  { label: 'Metas', href: '/metas' },
  { label: 'Finanzas', href: '/finanzas' },
]

const negociosItems = [
  { label: 'Empresas', href: '/empresas' },
  { label: 'Reuniones', href: '/reuniones' },
  { label: 'Corp. Tasks', href: '/corporate-tasks' },
  { label: 'Command Center', href: '/command-center' },
]

const contenidoItems = [
  { label: 'Content Creator', href: '/content-creator' },
  { label: 'Mis Mapas', href: '/mis-mapas' },
  { label: 'IRS News', href: '/irs-news' },
  { label: 'IRS Video', href: '/irs-video' },
]

// Iconos de la navegación principal, indexados por ruta (no por posición) para que
// agregar/quitar entradas no rompa las que ya estaban.
const navIcons: Record<string, React.ReactNode> = {
  '/dashboard': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  '/empresas': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  '/agentes': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  ),
  '/habitos': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  '/agenda': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  '/metas': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  '/finanzas': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  '/irs-news': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M13 4v6h6M9 12h6M9 16h6" />
    </svg>
  ),
  '/irs-video': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  ),
  '/content-creator': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
    </svg>
  ),
  '/mis-mapas': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  '/command-center': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="4.5" strokeWidth={1.5} />
      <circle cx="12" cy="12" r="1" strokeWidth={2} />
    </svg>
  ),
  '/corporate-tasks': (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
}

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const [tradingOpen, setTradingOpen] = useState(pathname.startsWith('/trading'))
  const [personalOpen, setPersonalOpen] = useState(personalItems.some((i) => pathname.startsWith(i.href)))
  const [negociosOpen, setNegociosOpen] = useState(negociosItems.some((i) => pathname.startsWith(i.href)))
  const [contenidoOpen, setContenidoOpen] = useState(contenidoItems.some((i) => pathname.startsWith(i.href)))
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
      active
        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/30 shadow-glow'
        : 'border border-transparent hover:bg-[var(--bg-hover)]'
    }`

  const navLink = (href: string, label: string, icon: React.ReactNode) => (
    <Link key={href} href={href} className={linkClass(isActive(href))}>
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  )

  const navGroup = (
    icon: React.ReactNode,
    label: string,
    items: { label: string; href: string }[],
    open: boolean,
    setOpen: (fn: (o: boolean) => boolean) => void,
  ) => {
    const groupActive = items.some((i) => pathname.startsWith(i.href))
    return (
      <div key={label}>
        <button
          onClick={() => !collapsed && setOpen((o) => !o)}
          className={`w-full ${linkClass(groupActive)}`}
        >
          {icon}
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{label}</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>

        {open && !collapsed && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[var(--bg-border)] pl-3">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-2 py-2 rounded-lg text-xs transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'text-cyan-300 bg-cyan-500/10'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-[var(--bg-hover)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  const groupIcon = (path: string) => (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={path} />
    </svg>
  )

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[var(--bg-sidebar)] border-b border-[var(--bg-border)] flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-gray-400 hover:text-white p-1"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded flex items-center justify-center bg-gradient-to-br from-cyan-500/30 to-violet-500/30 border border-cyan-400/40 shadow-glow">
            <svg className="w-3 h-3 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 16l4-4 4 4 4-6" />
            </svg>
          </div>
          <span className="font-display font-bold text-white text-sm">Marin Systems</span>
        </div>
      </header>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed left-0 top-0 h-full bg-[var(--bg-sidebar)] border-r border-[var(--bg-border)] flex flex-col z-50
          transition-all duration-300
          ${mobileOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full'}
          ${collapsed ? 'lg:w-16 lg:translate-x-0' : 'lg:w-60 lg:translate-x-0'}
        `}
      >
        {/* Brand */}
        <div className="p-4 border-b border-[var(--bg-border)] flex items-center justify-between min-h-[60px]">
          {(!collapsed) && (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-cyan-500/25 to-violet-500/25 border border-cyan-400/40 shadow-glow">
                <svg className="w-4 h-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 16l4-4 4 4 4-6" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold gradient-text text-sm tracking-tight truncate">Marin Systems</p>
                <p className="text-[10px] text-gray-500">Trading & Productividad</p>
              </div>
            </div>
          )}

          {collapsed && (
            <div className="hidden lg:flex w-full justify-center">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-cyan-500/25 to-violet-500/25 border border-cyan-400/40 shadow-glow">
                <svg className="w-4 h-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v18h18M7 16l4-4 4 4 4-6" />
                </svg>
              </div>
            </div>
          )}

          {/* Mobile close */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navLink('/dashboard', 'Dashboard', navIcons['/dashboard'])}
          {navLink('/empresas', 'Empresas', navIcons['/empresas'])}
          {navLink('/agentes', 'Agentes', navIcons['/agentes'])}

          {/* Trading */}
          <div>
            <button
              onClick={() => !collapsed && setTradingOpen(o => !o)}
              className={`w-full ${linkClass(pathname.startsWith('/trading'))}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Trading</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${tradingOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {tradingOpen && !collapsed && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-[var(--bg-border)] pl-3">
                {tradingItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block px-2 py-2 rounded-lg text-xs transition-colors ${
                      pathname === item.href
                        ? 'text-cyan-300 bg-cyan-500/10'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {navGroup(
            groupIcon('M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'),
            'Vida Personal',
            personalItems,
            personalOpen,
            setPersonalOpen,
          )}
          {navGroup(
            navIcons['/empresas'],
            'Negocios',
            negociosItems,
            negociosOpen,
            setNegociosOpen,
          )}
          {navGroup(
            navIcons['/content-creator'],
            'Contenido',
            contenidoItems,
            contenidoOpen,
            setContenidoOpen,
          )}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-[var(--bg-border)] space-y-0.5">
          {/* Desktop collapse toggle */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-[var(--bg-hover)] transition-colors"
          >
            <svg
              className={`w-4 h-4 flex-shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            {!collapsed && <span>Colapsar</span>}
          </button>

          <ThemeToggle />

          <Link
            href="/configuracion"
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              pathname === '/configuracion'
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-400/30 shadow-glow'
                : 'text-gray-500 hover:text-gray-200 hover:bg-[var(--bg-hover)]'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!collapsed && <span>Configuración</span>}
          </Link>

          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Mobile bottom nav — 5 items max for readability */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-sidebar)] border-t border-[var(--bg-border)] flex">
        <Link
          href="/dashboard"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] transition-colors ${
            isActive('/dashboard') ? 'text-cyan-300' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Dashboard
        </Link>
        <Link
          href="/trading/diario"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] transition-colors ${
            pathname.startsWith('/trading') ? 'text-cyan-300' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          Trading
        </Link>
        <Link
          href="/habitos"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] transition-colors ${
            isActive('/habitos') ? 'text-cyan-300' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Hábitos
        </Link>
        <Link
          href="/agenda"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[11px] transition-colors ${
            isActive('/agenda') ? 'text-cyan-300' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Agenda
        </Link>
      </nav>
    </>
  )
}
