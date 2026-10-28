import type { Metadata } from 'next'
import { OfficeView } from '@/components/office/OfficeView'

export const metadata: Metadata = {
  title: 'Oficina | Corporación Marin',
  description: 'Todos los agentes de la corporación, cada uno en su departamento',
}

export default function OficinaPage() {
  return <OfficeView />
}
