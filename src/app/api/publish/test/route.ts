import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { webhookHeaders } from '@/lib/publisher'

export const maxDuration = 30

// "Probar conexión": manda un mensaje de prueba al webhook de publicación y devuelve lo
// que respondió, para saber si PUBLISH_WEBHOOK_URL/SECRET están bien sin publicar nada real.
// El payload lleva test:true para que el escenario lo detenga antes de publicar en las redes.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.PUBLISH_WEBHOOK_URL
  if (!url) return NextResponse.json({ error: 'PUBLISH_WEBHOOK_URL no está configurado en Railway' }, { status: 400 })

  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: webhookHeaders(),
      body: JSON.stringify({
        test: true,
        postId: 'test',
        idempotencyKey: `test-${started}`,
        company: 'Prueba de conexión',
        platform: 'test',
        text: 'Mensaje de prueba de Corporación Marin. No publicar.',
        copy: 'Mensaje de prueba de Corporación Marin. No publicar.',
        hashtags: [],
        cta: '',
        linkedinText: 'Mensaje de prueba de Corporación Marin. No publicar.',
        imageUrl: null,
        imageUrls: [],
        isCarousel: false,
        scheduledDate: null,
        callbackUrl: null,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.text()).slice(0, 200)
    return NextResponse.json({ ok: res.ok, status: res.status, ms: Date.now() - started, body })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      status: null,
      ms: Date.now() - started,
      body: err instanceof Error ? err.message : String(err),
    })
  }
}
