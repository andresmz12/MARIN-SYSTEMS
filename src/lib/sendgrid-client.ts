import sgMail from '@sendgrid/mail'

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

interface TaskEmailData {
  title: string
  description: string
  dueDate: Date | string
  priority: string
}

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
}

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function buildHtml(to: string, task: TaskEmailData): string {
  const dueFormatted = new Date(task.dueDate).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium
  const priorityLabel = PRIORITY_LABELS[task.priority] ?? task.priority

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${task.title}</title>
</head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%);border-radius:12px 12px 0 0;padding:32px 40px;">
          <p style="margin:0 0 4px;color:#c4b5fd;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Marin Systems</p>
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">📋 Nueva Tarea Corporativa</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#1a1a1a;padding:32px 40px;">
          <h2 style="margin:0 0 16px;color:#ffffff;font-size:20px;font-weight:600;">${task.title}</h2>
          <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.7;">${task.description.replace(/\n/g, '<br/>')}</p>

          <!-- Metadata box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin-bottom:24px;">
            <tr>
              <td width="50%" style="padding:8px 0;">
                <p style="margin:0 0 2px;color:#71717a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Fecha límite</p>
                <p style="margin:0;color:#e4e4e7;font-size:14px;font-weight:500;">📅 ${dueFormatted}</p>
              </td>
              <td width="50%" style="padding:8px 0;">
                <p style="margin:0 0 2px;color:#71717a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Prioridad</p>
                <p style="margin:0;">
                  <span style="display:inline-block;background:${priorityColor}20;color:${priorityColor};border:1px solid ${priorityColor}40;border-radius:4px;padding:2px 10px;font-size:13px;font-weight:600;">
                    ${priorityLabel}
                  </span>
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:0;color:#52525b;font-size:13px;">Este correo fue enviado a <strong style="color:#71717a;">${to}</strong> desde Marin Systems.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#111111;border-radius:0 0 12px 12px;padding:20px 40px;border-top:1px solid #2a2a2a;">
          <p style="margin:0;color:#3f3f46;font-size:12px;text-align:center;">© ${new Date().getFullYear()} Marin Systems · Gestión Corporativa</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendTaskEmail(
  to: string,
  taskData: TaskEmailData,
  attachmentUrl?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isValidEmail(to)) {
    return { success: false, error: `Email inválido: ${to}` }
  }

  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, error: 'SENDGRID_API_KEY no configurado' }
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@marinsystems.com'

  const msg: Parameters<typeof sgMail.send>[0] = {
    to: to.trim(),
    from: fromEmail,
    subject: `📋 ${taskData.title}`,
    html: buildHtml(to, taskData),
    text: `${taskData.title}\n\n${taskData.description}\n\nFecha límite: ${new Date(taskData.dueDate).toLocaleString('es-CO')}\nPrioridad: ${taskData.priority}${attachmentUrl ? `\n\nAdjunto: ${attachmentUrl}` : ''}`,
  }

  try {
    const [response] = await sgMail.send(msg)
    return { success: true, messageId: response.headers['x-message-id'] as string }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido al enviar email'
    console.error('[SendGrid]', message)
    return { success: false, error: message }
  }
}
