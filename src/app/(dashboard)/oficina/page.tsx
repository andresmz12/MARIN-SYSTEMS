import { redirect } from 'next/navigation'

// La oficina vive ahora dentro de Agentes.
export default function OficinaPage() {
  redirect('/agentes')
}
