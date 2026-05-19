'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { SearchModal } from './ui/SearchModal'
import { DayNotifier } from './ui/DayNotifier'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex min-h-screen bg-[#0f0f0f]">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />
      <main
        className={`flex-1 min-h-screen overflow-x-hidden transition-all duration-300
          pt-14 pb-16 lg:pt-0 lg:pb-0
          ${collapsed ? 'lg:ml-16' : 'lg:ml-60'}
        `}
      >
        <div className="max-w-6xl mx-auto p-4 lg:p-6">{children}</div>
      </main>

      <SearchModal open={searchOpen} onClose={closeSearch} />
      <DayNotifier />
    </div>
  )
}
