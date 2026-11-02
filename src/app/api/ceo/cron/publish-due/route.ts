import { NextResponse } from 'next/server'
import { withCronLog } from '@/lib/cron-run'
import { runPublishDue } from '@/lib/publish-due'

export const maxDuration = 120

// Publica los posts aprobados cuya hora ya llegó, enviándolos por webhook a un
// servicio intermedio (Make, Zapier, n8n, ...) que los sube a cada red.
// Sin PUBLISH_WEBHOOK_URL no hace nada: los posts quedan "aprobados" para subir a mano.
// Además del cron de GitHub (que a veces se retrasa o se salta), la app lo revisa sola cada pocos minutos.
async function handler(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runPublishDue()
}

export const POST = withCronLog('publish-due', handler)
