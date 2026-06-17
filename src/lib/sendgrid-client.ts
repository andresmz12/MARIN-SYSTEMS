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
  urgent: '#dc2626',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
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

function taskRow(task: TaskEmailData): string {
  const color = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium
  const label = PRIORITY_LABELS[task.priority] ?? task.priority
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #2a2a2a;">
        <p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:600;">${task.title}</p>
        <p style="margin:0 0 6px;color:#a1a1aa;font-size:13px;line-height:1.5;">${task.description.replace(/\n/g, '<br/>')}</p>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="background:${color}20;color:${color};border:1px solid ${color}40;border-radius:4px;padding:1px 8px;font-size:11px;font-weight:600;">${label}</span>
          <span style="color:#52525b;font-size:11px;">📅 ${formatDate(task.dueDate)}</span>
        </div>
      </td>
    </tr>`
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
  const color = PRIORITY_COLORS[taskData.priority] ?? PRIORITY_COLORS.medium
  const label = PRIORITY_LABELS[taskData.priority] ?? taskData.priority
  const attachmentLine = attachmentUrl
    ? `<p style="margin:16px 0 0;"><a href="${attachmentUrl}" style="color:#818cf8;">Ver adjunto →</a></p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7);border-radius:12px 12px 0 0;padding:28px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Marin Systems · Nueva Tarea</p>
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">📋 ${taskData.title}</h1>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:28px 36px;">
    <p style="margin:0 0 16px;color:#a1a1aa;font-size:14px;line-height:1.7;">${taskData.description.replace(/\n/g, '<br/>')}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:16px 20px;">
      <tr>
        <td width="50%">
          <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Fecha límite</p>
          <p style="margin:0;color:#e4e4e7;font-size:13px;">📅 ${formatDate(taskData.dueDate)}</p>
        </td>
        <td width="50%">
          <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Prioridad</p>
          <span style="background:${color}20;color:${color};border:1px solid ${color}40;border-radius:4px;padding:2px 10px;font-size:12px;font-weight:600;">${label}</span>
        </td>
      </tr>
    </table>
    ${attachmentLine}
    <p style="margin:20px 0 0;color:#52525b;font-size:11px;">Enviado a <strong style="color:#71717a;">${to}</strong></p>
  </td></tr>
  <tr><td style="background:#111;border-radius:0 0 12px 12px;padding:14px 36px;border-top:1px solid #2a2a2a;">
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Marin Systems</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `Nueva tarea: ${taskData.title}\n\n${taskData.description}\n\nFecha: ${formatDate(taskData.dueDate)}\nPrioridad: ${label}${attachmentUrl ? `\n\nAdjunto: ${attachmentUrl}` : ''}`
  return sendEmail(to, subject, html, text)
}

export async function sendMorningReminder(
  to: string,
  tasks: TaskEmailData[],
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (tasks.length === 0) return { success: false, error: 'Sin tareas para enviar' }

  const subject = `🌅 Tienes ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} para HOY`

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#059669,#10b981,#34d399);border-radius:12px 12px 0 0;padding:28px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Marin Systems · Recordatorio Matutino</p>
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🌅 Tienes ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} para HOY</h1>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:28px 36px;">
    <div style="background:#10b98115;border:1px solid #10b98130;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;color:#10b981;font-size:13px;font-weight:600;">⏰ Planifica tu jornada — estas tareas vencen hoy.</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${tasks.map(taskRow).join('')}
    </table>
    <p style="margin:20px 0 0;color:#52525b;font-size:11px;">Enviado a <strong style="color:#71717a;">${to}</strong></p>
  </td></tr>
  <tr><td style="background:#111;border-radius:0 0 12px 12px;padding:14px 36px;border-top:1px solid #2a2a2a;">
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Marin Systems</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `Tienes ${tasks.length} tarea(s) para HOY:\n\n${tasks.map((t) => `• ${t.title} — ${formatDate(t.dueDate)}`).join('\n')}`
  const result = await sendEmail(to, subject, html, text)
  if (result.success) console.log(`[SendGrid] Recordatorio matutino enviado a ${to} con ${tasks.length} tarea(s)`)
  return result
}

export async function sendEveningReminder(
  to: string,
  tasks: TaskEmailData[],
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (tasks.length === 0) return { success: false, error: 'Sin tareas para enviar' }

  const subject = `🌙 Tienes ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} SIN COMPLETAR`

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,#d97706,#f59e0b,#fbbf24);border-radius:12px 12px 0 0;padding:28px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Marin Systems · Recordatorio Nocturno</p>
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🌙 ${tasks.length} tarea${tasks.length > 1 ? 's' : ''} sin completar</h1>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:28px 36px;">
    <div style="background:#f59e0b15;border:1px solid #f59e0b30;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;color:#f59e0b;font-size:13px;font-weight:600;">⚠️ Completa estas tareas si es posible antes de que termine el día.</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${tasks.map(taskRow).join('')}
    </table>
    <p style="margin:20px 0 0;color:#52525b;font-size:11px;">Enviado a <strong style="color:#71717a;">${to}</strong></p>
  </td></tr>
  <tr><td style="background:#111;border-radius:0 0 12px 12px;padding:14px 36px;border-top:1px solid #2a2a2a;">
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Marin Systems</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `Tienes ${tasks.length} tarea(s) sin completar:\n\n${tasks.map((t) => `• ${t.title} — ${formatDate(t.dueDate)}`).join('\n')}\n\nCompleta estas tareas si es posible antes de que termine el día.`
  const result = await sendEmail(to, subject, html, text)
  if (result.success) console.log(`[SendGrid] Recordatorio nocturno enviado a ${to} con ${tasks.length} pendiente(s)`)
  return result
}
