import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildOffice } from '@/lib/office'

export const dynamic = 'force-dynamic'

// Estado actual de todos los departamentos y agentes (lo lee la pantalla Oficina).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ now: new Date().toISOString(), departments: await buildOffice(session.user.id) })
  } catch (err) {
    console.error('[office]', err)
    return NextResponse.json({ error: 'Error al cargar la oficina' }, { status: 500 })
  }
}
