import { DashboardShell } from '@/components/DashboardShell'
import { QuickNotes } from '@/components/ui/QuickNotes'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      {children}
      <QuickNotes />
    </DashboardShell>
  )
}
