import { Sidebar } from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#0f0f0f]">
      <Sidebar />
      {/* pt-14 = mobile top bar height; pb-16 = mobile bottom nav height */}
      <main className="flex-1 lg:ml-60 min-h-screen overflow-x-hidden pt-14 pb-16 lg:pt-0 lg:pb-0">
        <div className="max-w-6xl mx-auto p-4 lg:p-6">{children}</div>
      </main>
    </div>
  )
}
