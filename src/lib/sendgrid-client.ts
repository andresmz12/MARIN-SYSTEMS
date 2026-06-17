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
  urgent: '#dc2626',
  medium: '#f59e0b',
  low: '#22c55e',
}

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Alta',
  urgent: 'Urgente',
  medium: 'Media',
  low: 'Baja',
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function baseHtml(
  to: string,
  headerGradient: string,
  headerLabel: string,
  subject: string,
  task: TaskEmailData,
  bodyExtra?: string,
): string {
  const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium
  const priorityLabel = PRIORITY_LABELS[task.priority] ?? task.priority

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:${headerGradient};border-radius:12px 12px 0 0;padding:32px 40px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Marin Systems · ${headerLabel}</p>
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${subject}</h1>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:32px 40px;">
    <h2 style="margin:0 0 12px;color:#ffffff;font-size:18px;font-weight:600;">${task.title}</h2>
    <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.7;">${task.description.replace(/\n/g, '<br/>')}</p>
    ${bodyExtra ?? ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:20px;margin-bottom:16px;">
      <tr>
        <td width="50%" style="padding:6px 0;">
          <p style="margin:0 0 2px;color:#71717a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Fecha límite</p>
          <p style="margin:0;color:#e4e4e7;font-size:13px;font-weight:500;">📅 ${formatDate(task.dueDate)}</p>
        </td>
        <td width="50%" style="padding:6px 0;">
          <p style="margin:0 0 2px;color:#71717a;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Prioridad</p>
          <p style="margin:0;"><span style="display:inline-block;background:${priorityColor}20;color:${priorityColor};border:1px solid ${priorityColor}40;border-radius:4px;padding:2px 10px;font-size:12px;font-weight:600;">${priorityLabel}</span></p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#52525b;font-size:12px;">Enviado a <strong style="color:#71717a;">${to}</strong></p>
  </td></tr>
  <tr><td style="background:#111;border-radius:0 0 12px 12px;padding:16px 40px;border-top:1px solid #2a2a2a;">
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Marin Systems · Gestión Corporativa</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!isValidEmail(to)) return { success: false, error: `Email inválido: ${to}` }
  if (!process.env.SENDGRID_API_KEY) return { success: false, error: 'SENDGRID_API_KEY no configurado' }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@marinsystems.com'

  try {
    const [response] = await sgMail.send({ to: to.trim(), from: fromEmail, subject, html, text })
    const messageId = response.headers['x-message-id'] as string | undefined
    console.log(`[SendGrid] Enviado a ${to} — ${subject} (${messageId ?? 'no-id'})`)
    return { success: true, messageId }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error(`[SendGrid] Error enviando a ${to}: ${message}`)
    return { success: false, error: message }
  }
}

export async function sendTaskEmail(
  to: string,
  taskData: TaskEmailData,
  attachmentUrl?: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `📋 Nueva tarea: ${taskData.title}`
  const attachmentLine = attachmentUrl
    ? `<p style="margin:0 0 20px;"><a href="${attachmentUrl}" style="color:#818cf8;">Ver adjunto →</a></p>`
    : ''

  const html = baseHtml(
    to,
    'linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a855f7 100%)',
    'Nueva Tarea Corporativa',
    subject,
    taskData,
    attachmentLine,
  )

  const text = `Nueva tarea: ${taskData.title}\n\n${taskData.description}\n\nFecha: ${formatDate(taskData.dueDate)}\nPrioridad: ${taskData.priority}${attachmentUrl ? `\n\nAdjunto: ${attachmentUrl}` : ''}`
  return sendEmail(to, subject, html, text)
}

export async function sendMorningReminder(
  to: string,
  taskData: TaskEmailData,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `🌅 Recordatorio mañana: ${taskData.title}`
  const extra = `<div style="background:#10b98120;border:1px solid #10b98140;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
    <p style="margin:0;color:#10b981;font-size:13px;font-weight:600;">⏰ Esta tarea vence mañana — planifica tu tiempo hoy.</p>
  </div>`

  const html = baseHtml(
    to,
    'linear-gradient(135deg,#059669 0%,#10b981 50%,#34d399 100%)',
    'Recordatorio Matutino',
    subject,
    taskData,
    extra,
  )

  const text = `Recordatorio mañana: ${taskData.title}\n\nEsta tarea vence mañana. Planifica tu tiempo hoy.\n\n${taskData.description}\n\nFecha: ${formatDate(taskData.dueDate)}`
  return sendEmail(to, subject, html, text)
}

export async function sendEveningReminder(
  to: string,
  taskData: TaskEmailData,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `🌙 Tarea pendiente: ${taskData.title}`
  const extra = `<div style="background:#f59e0b20;border:1px solid #f59e0b40;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
    <p style="margin:0;color:#f59e0b;font-size:13px;font-weight:600;">🕕 Esta tarea vence hoy — complétala si es posible.</p>
  </div>`

  const html = baseHtml(
    to,
    'linear-gradient(135deg,#d97706 0%,#f59e0b 50%,#fbbf24 100%)',
    'Recordatorio Nocturno',
    subject,
    taskData,
    extra,
  )

  const text = `Tarea pendiente: ${taskData.title}\n\nVence hoy — complétala si es posible.\n\n${taskData.description}\n\nFecha: ${formatDate(taskData.dueDate)}`
  return sendEmail(to, subject, html, text)
}
