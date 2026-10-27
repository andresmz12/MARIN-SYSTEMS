import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Pública a propósito: las redes (o el servicio que publica) bajan la imagen por
// esta URL. El token es un cuid no adivinable y solo sirve para una imagen.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const image = await prisma.postImage.findUnique({ where: { token: params.token } })
  if (!image) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      'Content-Type': image.mime,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
