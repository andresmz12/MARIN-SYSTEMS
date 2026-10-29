import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { POST as runNewsWatch } from '@/app/api/ceo/cron/news-watch/route'

export const maxDuration = 300

// Busca noticias nuevas de UNA empresa desde la pantalla, sin pasar por GitHub. Es el mismo proceso del
// cron diario (mismas verificaciones y filtros) y devuelve qué vio, qué creó y qué descartó con su motivo.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })

  const { companyId } = (await req.json().catch(() => ({}))) as { companyId?: string }
  if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })
  const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId: session.user.id }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const res = await runNewsWatch(new Request(req.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json', 'x-wait': '1' },
    body: JSON.stringify({ companyId }),
  }))
  const data = await res.json().catch(() => ({}))
  return NextResponse.json(data, { status: res.status })
}
