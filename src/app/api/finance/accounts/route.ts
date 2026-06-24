import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const Schema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['banco', 'efectivo', 'ahorros']),
  balance: z.number().default(0),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const accounts = await prisma.financeAccount.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(accounts)
  } catch (err) {
    console.error('[finance/accounts GET]', err)
    return NextResponse.json({ error: 'Error al obtener cuentas' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = Schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  try {
    const account = await prisma.financeAccount.create({
      data: { userId: session.user.id, ...parsed.data },
    })
    return NextResponse.json(account, { status: 201 })
  } catch (err) {
    console.error('[finance/accounts POST]', err)
    return NextResponse.json({ error: 'Error al crear cuenta' }, { status: 500 })
  }
}
