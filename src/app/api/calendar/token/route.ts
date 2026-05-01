import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { calendarToken: true },
  })

  if (user?.calendarToken) {
    return NextResponse.json({ token: user.calendarToken })
  }

  // Generate new token
  const token = randomBytes(32).toString('hex')
  await prisma.user.update({ where: { id: session.user.id }, data: { calendarToken: token } })
  return NextResponse.json({ token })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = randomBytes(32).toString('hex')
  await prisma.user.update({ where: { id: session.user.id }, data: { calendarToken: token } })
  return NextResponse.json({ token })
}
