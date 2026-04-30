import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Marin Systems',
  description: 'Sistema personal de productividad y trading',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#0f0f0f] text-gray-200 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
