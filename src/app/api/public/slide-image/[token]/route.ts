import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Pública a propósito, igual que post-image: el token no es adivinable y sirve para una sola lámina.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const image = await prisma.postSlideImage.findUnique({ where: { token: params.token } })
  if (!image) return new NextResponse('Not found', { status: 404 })
  return new NextResponse(new Uint8Array(image.data), {
    headers: { 'Content-Type': image.mime, 'Cache-Control': 'public, max-age=86400' },
  })
}
