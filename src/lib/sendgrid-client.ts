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
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Corporación Marin · Nueva Tarea</p>
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
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Corporación Marin</p>
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
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Corporación Marin · Recordatorio Matutino</p>
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
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Corporación Marin</p>
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

export async function sendAgentAlertEmail({
  agentName,
  appName,
  status,
  latency,
  reason,
  since,
}: {
  agentName: string
  appName: string
  status: 'down' | 'degraded'
  latency: number | null
  reason?: string | null
  since?: Date | null
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const to = process.env.ALERT_EMAIL_TO ?? ''
  if (!to) return { success: false, error: 'ALERT_EMAIL_TO no configurado' }

  const statusLabel = status === 'down' ? '🔴 CAÍDO' : '🟡 DEGRADADO'
  const statusColor = status === 'down' ? '#ef4444' : '#f59e0b'
  const gradientColors = status === 'down'
    ? '#991b1b,#dc2626,#ef4444'
    : '#92400e,#d97706,#f59e0b'
  const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  const sinceLabel = since ? since.toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app'
  const subject = `[Corporación Marin] Alerta: ${agentName} está ${statusLabel}`

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:linear-gradient(135deg,${gradientColors});border-radius:12px 12px 0 0;padding:28px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Corporación Marin · Monitoreo de Agentes</p>
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">⚠️ ${agentName} está ${statusLabel}</h1>
  </td></tr>
  <tr><td style="background:#1a1a1a;padding:28px 36px;">
    <div style="background:${statusColor}15;border:1px solid ${statusColor}30;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="margin:0;color:${statusColor};font-size:13px;font-weight:600;">
        El agente <strong>${agentName}</strong> (${appName}) está reportando como <strong>${statusLabel}</strong>.
      </p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:16px 20px;">
      <tr>
        <td width="50%">
          <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Agente</p>
          <p style="margin:0;color:#e4e4e7;font-size:13px;">${agentName}</p>
        </td>
        <td width="50%">
          <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Latencia</p>
          <p style="margin:0;color:#e4e4e7;font-size:13px;">${latency != null ? `${latency}ms` : '—'}</p>
        </td>
      </tr>
      ${reason ? `<tr><td colspan="2" style="padding-top:12px;">
        <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Motivo</p>
        <p style="margin:0;color:#e4e4e7;font-size:13px;">${reason}</p>
      </td></tr>` : ''}
      ${sinceLabel ? `<tr><td colspan="2" style="padding-top:12px;">
        <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Desde (Colombia)</p>
        <p style="margin:0;color:#e4e4e7;font-size:13px;">${sinceLabel}</p>
      </td></tr>` : ''}
      <tr><td colspan="2" style="padding-top:12px;">
        <p style="margin:0 0 2px;color:#71717a;font-size:10px;letter-spacing:1px;text-transform:uppercase;">Detectado (Colombia)</p>
        <p style="margin:0;color:#e4e4e7;font-size:13px;">${now}</p>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;">
      <a href="${appUrl}/agentes"
         style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">
        Ver en Corporación Marin →
      </a>
    </p>
  </td></tr>
  <tr><td style="background:#111;border-radius:0 0 12px 12px;padding:14px 36px;border-top:1px solid #2a2a2a;">
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Corporación Marin</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`

  const text = `Alerta Corporación Marin: ${agentName} está ${statusLabel}\n${appName}\n${reason ? `Motivo: ${reason}\n` : ''}${sinceLabel ? `Desde: ${sinceLabel}\n` : ''}${latency != null ? `Latencia: ${latency}ms\n` : ''}Detectado: ${now}\n\nVer: ${appUrl}/agentes`
  return sendEmail(to, subject, html, text)
}

function formatDuration(ms: number | null): string {
  if (ms == null || ms < 0) return 'desconocida'
  const min = Math.round(ms / 60000)
  if (min < 1) return 'menos de 1 minuto'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

export async function sendAgentRecoveredEmail({
  agentName,
  appName,
  downtimeMs,
}: {
  agentName: string
  appName: string
  downtimeMs: number | null
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const to = process.env.ALERT_EMAIL_TO ?? ''
  if (!to) return { success: false, error: 'ALERT_EMAIL_TO no configurado' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app'
  const duration = formatDuration(downtimeMs)
  const subject = `[Corporación Marin] ${agentName} se recuperó ✅`
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#0f0f0f;padding:32px;color:#e4e4e7;">
  <h2 style="margin:0 0 8px;">✅ ${agentName} se recuperó</h2>
  <p style="margin:0 0 16px;color:#a1a1aa;"><strong>${appName}</strong> volvió a responder. Duración del problema: <strong>${duration}</strong>.</p>
  <a href="${appUrl}/agentes" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Ver en Corporación Marin →</a>
</div>`
  const text = `${agentName} (${appName}) se recuperó. Duración del problema: ${duration}.\n\nVer: ${appUrl}/agentes`
  return sendEmail(to, subject, html, text)
}

export async function sendCronFailureEmail({
  job,
  error,
}: {
  job: string
  error: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const to = process.env.ALERT_EMAIL_TO ?? ''
  if (!to) return { success: false, error: 'ALERT_EMAIL_TO no configurado' }

  const subject = `[Corporación Marin] Falló la tarea automática "${job}"`
  const safe = error.slice(0, 500).replace(/</g, '&lt;')
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#0f0f0f;padding:32px;color:#e4e4e7;">
  <h2 style="margin:0 0 8px;">⚠️ Falló la tarea "${job}"</h2>
  <p style="margin:0;color:#a1a1aa;">${safe}</p>
</div>`
  return sendEmail(to, subject, html, `Falló la tarea automática "${job}": ${error.slice(0, 500)}`)
}

export async function sendContentReadyEmail({
  companyName,
  count,
  pendingTotal,
  newsTitle,
}: {
  companyName: string
  count: number
  pendingTotal: number
  /** Si el contenido nace de una noticia, su titular (cambia el asunto y el texto). */
  newsTitle?: string
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const to = process.env.ALERT_EMAIL_TO ?? ''
  if (!to) return { success: false, error: 'ALERT_EMAIL_TO no configurado' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app'
  const subject = newsTitle
    ? `[Corporación Marin] 📰 Noticia nueva para ${companyName}: ${newsTitle.slice(0, 80)}`
    : `[Corporación Marin] ${count} post${count > 1 ? 's' : ''} de ${companyName} por aprobar`
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#0f0f0f;padding:32px;color:#e4e4e7;">
  <h2 style="margin:0 0 8px;">✅ Contenido listo para revisar</h2>
  <p style="margin:0 0 16px;color:#a1a1aa;">Se generaron ${count} post${count > 1 ? 's' : ''} nuevo${count > 1 ? 's' : ''} para <strong>${companyName}</strong>. Tienes ${pendingTotal} por aprobar en total.</p>
  <a href="${appUrl}/command-center" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Revisar y aprobar →</a>
</div>`
  const text = `${count} post(s) de ${companyName} por aprobar (${pendingTotal} en total).\n\nRevisar: ${appUrl}/command-center`
  return sendEmail(to, subject, html, text)
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
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:2px;text-transform:uppercase;">Corporación Marin · Recordatorio Nocturno</p>
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
    <p style="margin:0;color:#3f3f46;font-size:11px;text-align:center;">© ${new Date().getFullYear()} Corporación Marin</p>
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

/** Informe de un agente programado (métricas, temas...) por correo. */
export async function sendAgentReportEmail({
  title,
  intro,
  sections,
}: {
  title: string
  intro: string
  sections: { heading: string; items: string[] }[]
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const to = process.env.ALERT_EMAIL_TO ?? ''
  if (!to) return { success: false, error: 'ALERT_EMAIL_TO no configurado' }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app'
  const body = sections
    .filter((s) => s.items.length > 0)
    .map((s) => `<h3 style="margin:16px 0 6px;color:#e4e4e7;">${esc(s.heading)}</h3><ul style="margin:0;padding-left:20px;color:#d4d4d8;">${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`)
    .join('')
  const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#0f0f0f;padding:32px;color:#e4e4e7;">
  <h2 style="margin:0 0 8px;">${esc(title)}</h2>
  <p style="margin:0 0 8px;color:#a1a1aa;">${esc(intro)}</p>${body}
  <p style="margin-top:20px;"><a href="${appUrl}/command-center" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Abrir Command Center →</a></p>
</div>`
  const text = `${title}\n\n${intro}\n\n${sections.map((s) => `${s.heading}\n${s.items.map((i) => `- ${i}`).join('\n')}`).join('\n\n')}\n\n${appUrl}/command-center`
  return sendEmail(to, `[Corporación Marin] ${title}`, html, text)
}
