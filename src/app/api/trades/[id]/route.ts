import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trade = await prisma.trade.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updated = await prisma.trade.update({
    where: { id: params.id },
    data: {
      pair: body.pair ?? trade.pair,
      result: body.result ?? trade.result,
      pips: body.pips !== undefined ? parseFloat(body.pips) : trade.pips,
      setup: body.setup ?? trade.setup,
      emotion: body.emotion ?? trade.emotion,
      followedPlan: body.followedPlan !== undefined ? Boolean(body.followedPlan) : trade.followedPlan,
      notes: body.notes ?? trade.notes,
      ...(body.screenshot !== undefined && { screenshot: body.screenshot ?? null }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trade = await prisma.trade.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.trade.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
