import { Sidebar } from '@/components/Sidebar'
import { QuickNotes } from '@/components/ui/QuickNotes'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0f0f0f]">
      <Sidebar />
      <main className="flex-1 md:ml-60 min-h-screen overflow-x-hidden pt-14 md:pt-0">
        <div className="max-w-6xl mx-auto p-6">{children}</div>
      </main>
      <QuickNotes />
    </div>
  )
}
