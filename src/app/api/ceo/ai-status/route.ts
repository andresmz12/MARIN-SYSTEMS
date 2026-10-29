import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Estado de la IA: si el último intento falló (sin crédito, límite, clave) y desde cuándo.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const row = await prisma.aiStatus.findUnique({ where: { id: 'main' } })
  const failing = !!row?.failKind
  return NextResponse.json({
    failing,
    kind: failing ? row!.failKind : null,
    message: failing ? row!.failMessage : null,
    since: failing ? row!.failAt : null,
    okAt: row?.okAt ?? null,
  })
}
