import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  const session = await prisma.studioSession.findUnique({ where: { token } })
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (session.expiresAt < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  return NextResponse.json({
    tema:       session.tema,
    redSocial:  session.redSocial,
    duracion:   session.duracion,
    mapaJson:   session.mapaJson,
    guion:      session.guion,
    timestamps: session.timestamps ?? [],
  })
}
