import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as runAutoContent } from '@/app/api/ceo/cron/auto-content/route'

export const maxDuration = 300

// Genera la tanda de la semana de UNA empresa desde la pantalla, sin pasar por GitHub.
// Usa el mismo proceso del domingo (mismas reglas, verificación y aviso por correo).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })

  const { companyId } = (await req.json().catch(() => ({}))) as { companyId?: string }
  if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })
  const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId: session.user.id }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const res = await runAutoContent(new Request(req.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json', 'x-wait': '1' },
    body: JSON.stringify({ companyId }),
  }))
  const data = (await res.json().catch(() => ({}))) as { summary?: { created: number; skipped?: string; error?: string }[]; error?: string }
  if (!res.ok) return NextResponse.json({ error: data.error ?? 'No se pudo generar la tanda' }, { status: res.status })
  const r = data.summary?.[0]
  if (!r) return NextResponse.json({ error: 'El piloto automático está apagado para esta empresa' }, { status: 400 })
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 })
  return NextResponse.json({ created: r.created, skipped: r.skipped ?? null })
}
