import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import sharp from 'sharp'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openaiImageReady } from '@/lib/openai-image'

const KINDS = ['logo', 'face']

// Estado de la generación de imágenes con IA y de las imágenes de referencia de la marca.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId requerido' }, { status: 400 })

  // Con ?kind=logo|face devuelve la imagen para mostrarla en pantalla.
  const kind = new URL(req.url).searchParams.get('kind')
  if (kind) {
    const asset = await prisma.brandAsset.findFirst({ where: { companyId, userId: session.user.id, kind } })
    if (!asset) return new NextResponse(null, { status: 404 })
    return new NextResponse(new Uint8Array(asset.data), { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'private, max-age=60' } })
  }
  const rows = await prisma.brandAsset.findMany({ where: { companyId, userId: session.user.id }, select: { kind: true, updatedAt: true } })
  return NextResponse.json({
    openaiReady: openaiImageReady(),
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    logo: rows.find((r) => r.kind === 'logo')?.updatedAt ?? null,
    face: rows.find((r) => r.kind === 'face')?.updatedAt ?? null,
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await req.formData()
    const companyId = String(form.get('companyId') ?? '')
    const kind = String(form.get('kind') ?? '')
    const file = form.get('file')
    if (!KINDS.includes(kind) || !companyId || !(file instanceof File)) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'La imagen debe pesar menos de 8 MB' }, { status: 400 })
    const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId: session.user.id }, select: { id: true } })
    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    // PNG de máximo 1024 px (suficiente de referencia y liviano para la API).
    const png = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    await prisma.brandAsset.upsert({
      where: { companyId_kind: { companyId, kind } },
      create: { userId: session.user.id, companyId, kind, data: png, mime: 'image/png' },
      update: { data: png, mime: 'image/png' },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[brand-assets]', err)
    return NextResponse.json({ error: 'No se pudo guardar la imagen' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const companyId = sp.get('companyId')
  const kind = sp.get('kind')
  if (!companyId || !kind || !KINDS.includes(kind)) return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  await prisma.brandAsset.deleteMany({ where: { companyId, userId: session.user.id, kind } })
  return NextResponse.json({ ok: true })
}
