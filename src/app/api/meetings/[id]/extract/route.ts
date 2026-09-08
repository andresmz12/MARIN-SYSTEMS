import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractMeetingNotes } from '@/lib/meetings'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meeting = await prisma.meeting.findFirst({
    where: { id: params.id, userId: session.user.id },
    select: { id: true, companyId: true },
  })
  if (!meeting) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const body = await req.json().catch(() => null) as { images?: unknown; mindmapText?: unknown } | null
  const images = Array.isArray(body?.images)
    ? body.images.filter((s): s is string => typeof s === 'string').map((s) => s.replace(/^data:image\/png;base64,/, ''))
    : []
  const mindmapText = typeof body?.mindmapText === 'string' ? body.mindmapText : ''
  if (images.length === 0 && !mindmapText.trim()) {
    return NextResponse.json({ error: 'No hay contenido para extraer' }, { status: 400 })
  }

  try {
    const { summary, tasks } = await extractMeetingNotes(images, mindmapText)

    await prisma.$transaction([
      prisma.meeting.update({ where: { id: meeting.id }, data: { summary } }),
      prisma.meetingTask.deleteMany({ where: { meetingId: meeting.id } }),
      ...tasks.map((title) =>
        prisma.meetingTask.create({ data: { meetingId: meeting.id, title } })
      ),
      // Si la reunión está ligada a una empresa, las tareas también aparecen
      // directamente en el tablero de esa empresa — no solo en la reunión.
      ...(meeting.companyId
        ? tasks.map((title) =>
            prisma.companyTask.create({
              data: { companyId: meeting.companyId!, userId: session.user.id, title },
            })
          )
        : []),
    ])

    return NextResponse.json({ summary, tasks })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error extrayendo notas'
    console.error('[meetings/extract] failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
