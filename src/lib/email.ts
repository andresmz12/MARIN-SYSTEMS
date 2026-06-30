import sgMail from '@sendgrid/mail';

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? '';
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO ?? '';
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM ?? '';

export async function sendAgentAlertEmail({
  agentName,
  appName,
  status,
  latency,
}: {
  agentName: string;
  appName: string;
  status: 'down' | 'degraded';
  latency: number | null;
}): Promise<void> {
  if (!SENDGRID_API_KEY || !ALERT_EMAIL_TO || !ALERT_EMAIL_FROM) {
    console.warn('[email] Skipping alert — SENDGRID_API_KEY / ALERT_EMAIL_TO / ALERT_EMAIL_FROM not set');
    return;
  }

  sgMail.setApiKey(SENDGRID_API_KEY);

  const statusLabel = status === 'down' ? '🔴 CAÍDO' : '🟡 DEGRADADO';
  const now = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://marin-systems-production.up.railway.app';

  await sgMail.send({
    to: ALERT_EMAIL_TO,
    from: ALERT_EMAIL_FROM,
    subject: `[Marin Systems] Alerta: ${agentName} está ${statusLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px;">
        <h2 style="color:#f8fafc;margin-top:0;">⚠️ Alerta de Monitoreo</h2>
        <p style="font-size:15px;">
          El agente <strong style="color:#f8fafc;">${agentName}</strong>
          (<span style="color:#94a3b8;">${appName}</span>)
          está reportando como <strong style="color:${status === 'down' ? '#f87171' : '#fbbf24'};">${statusLabel}</strong>.
        </p>
        ${latency != null ? `<p style="font-size:13px;color:#94a3b8;">Latencia registrada: <strong style="color:#e2e8f0;">${latency}ms</strong></p>` : ''}
        <p style="font-size:13px;color:#94a3b8;">Hora (Colombia): <strong style="color:#e2e8f0;">${now}</strong></p>
        <a href="${appUrl}/agentes"
           style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;">
          Ver en Marin Systems →
        </a>
      </div>
    `,
  });
}
