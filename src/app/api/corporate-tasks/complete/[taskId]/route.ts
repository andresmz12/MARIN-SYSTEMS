import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const html = (title: string, msg: string, color: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { text-align: center; padding: 2.5rem 3rem; background: white; border-radius: 1rem; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.4rem; color: ${color}; }
    p { margin: 0; color: #64748b; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${title.startsWith('✅') ? '✅' : '❌'}</div>
    <h1>${title}</h1>
    <p>${msg}</p>
  </div>
</body>
</html>`

async function complete(taskId: string): Promise<Response> {
  const instance = await prisma.taskInstance.findUnique({ where: { id: taskId } })

  if (!instance) {
    return new Response(
      html('❌ No encontrada', 'El enlace no corresponde a ninguna tarea.', '#ef4444'),
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  if (instance.status === 'completed') {
    return new Response(
      html('✅ Ya completada', 'Esta tarea ya fue marcada como completada anteriormente.', '#10b981'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  await prisma.taskInstance.update({
    where: { id: taskId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { status: 'completed', completedAt: new Date() } as any,
  })

  return new Response(
    html('✅ Tarea completada', '¡Gracias! La tarea ha sido marcada como completada.', '#10b981'),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(_req: Request, { params }: { params: { taskId: string } }) {
  return complete(params.taskId)
}

export async function POST(_req: Request, { params }: { params: { taskId: string } }) {
  return complete(params.taskId)
}
