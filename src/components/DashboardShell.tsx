'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

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
    </div>
  )
}
