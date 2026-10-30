import { prisma } from '@/lib/prisma'
import { sendAgentAlertEmail, sendAgentRecoveredEmail } from '@/lib/sendgrid-client'
import { logActivity } from '@/lib/agent-ledger'

const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000 // 4 horas entre alertas repetidas
// Fallas consecutivas antes de avisar: evita falsas alarmas por un timeout suelto.
const DOWN_THRESHOLD = 2
const DEGRADED_THRESHOLD = 3

export interface HealthCheckResult {
  id: string;
  name: string;
  agentName: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency: number | null;
  uptime: number | null;
  message: string | null;
  errorRate: number | null;
  consecutiveFailures: number;
  databaseConnected: boolean;
  memoryUsage: number | null;
  cpuUsage: number | null;
  httpStatusCode: number | null;
}

interface AppHealthFields {
  status: 'healthy' | 'degraded' | 'down';
  latency: number | null;
  uptime: number | null;
  errorRate: number | null;
  consecutiveFailures: number;
  databaseConnected: boolean;
  memoryUsage: number | null;
  cpuUsage: number | null;
  httpStatusCode: number | null;
  errorDetail: string | null;
}

// Turn a fetch failure into a human-readable reason instead of a generic "down" —
// this is what tells the user WHY an agent isn't reporting real data (bad URL,
// DNS failure, no health endpoint, timeout, etc.) instead of just a red dot.
function describeFetchError(err: unknown, timeout: number): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return `Sin respuesta en ${timeout / 1000}s (timeout)`;
  }
  if (err instanceof TypeError) {
    const msg = err.message || '';
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) return 'Dominio no existe (DNS)';
    if (/ECONNREFUSED/i.test(msg)) return 'Conexión rechazada — el servicio no responde en esa URL';
    if (/certificate|SSL|TLS/i.test(msg)) return 'Error de certificado SSL';
    return `No se pudo conectar (${msg || 'fetch failed'})`;
  }
  return err instanceof Error ? err.message : 'Error desconocido al verificar salud';
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function clamp(v: number | null): number | null {
  return v != null ? Math.min(100, Math.max(0, v)) : null;
}

// Interpret an app's self-reported `status` string. Returns null when the value
// is missing or unrecognized (so we fall back to the HTTP-code signal).
function mapReportedStatus(v: unknown): 'healthy' | 'degraded' | 'down' | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (['ok', 'okay', 'healthy', 'up', 'online', 'operational', 'pass', 'passing', 'ready', 'alive'].includes(s)) return 'healthy';
  if (['degraded', 'warning', 'warn', 'partial', 'slow', 'unstable'].includes(s)) return 'degraded';
  if (['error', 'down', 'unhealthy', 'fail', 'failed', 'failing', 'critical', 'offline', 'dead'].includes(s)) return 'down';
  return null;
}

// Tolerant read of DB connectivity: some apps send `databaseConnected: bool`,
// others send `db: 'connected'|'disconnected'` (Marin-style) or `database`.
function readDbConnected(data: Record<string, unknown>): boolean {
  if (typeof data.databaseConnected === 'boolean') return data.databaseConnected;
  const db = data.db ?? data.database;
  if (typeof db === 'boolean') return db;
  if (typeof db === 'string') return !/disconnect|down|error|fail|off/i.test(db);
  return true;
}

// Field-name-tolerant metric extraction (memoryUsage vs memory, cpuUsage vs cpu, …).
function pickNum(data: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (data[k] != null) return clamp(parseNum(data[k]));
  }
  return null;
}

async function checkAppHealth(healthUrl: string, timeout = 5000): Promise<AppHealthFields> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    // Parse the body even on non-2xx — health endpoints often return their real
    // state (db down, degraded) with a 503/500 status code.
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // non-JSON or empty body — fall back to HTTP-code signal only
    }

    const reported = mapReportedStatus(data.status);
    const fields = {
      latency,
      uptime: pickNum(data, ['uptime', 'uptimePercent', 'uptimePercentage']),
      errorRate: pickNum(data, ['errorRate', 'error_rate', 'errors']),
      consecutiveFailures: parseNum(data.consecutiveFailures) ?? 0,
      databaseConnected: readDbConnected(data),
      memoryUsage: pickNum(data, ['memoryUsage', 'memory', 'mem', 'memoryPercent']),
      cpuUsage: pickNum(data, ['cpuUsage', 'cpu', 'cpuPercent']),
    };

    if (!response.ok) {
      // Trust an explicit "down" over the generic non-2xx → degraded default.
      return {
        status: reported === 'down' ? 'down' : 'degraded',
        ...fields,
        httpStatusCode: response.status,
        errorDetail: `HTTP ${response.status} en ${healthUrl}`,
      };
    }

    // 2xx: honor the app's own status when it self-reports a problem, else healthy.
    return { status: reported ?? 'healthy', ...fields, httpStatusCode: response.status, errorDetail: null };
  } catch (err) {
    return {
      status: 'down',
      latency: Date.now() - startTime,
      uptime: null,
      errorRate: null,
      consecutiveFailures: 0,
      databaseConnected: false,
      memoryUsage: null,
      cpuUsage: null,
      httpStatusCode: null,
      errorDetail: describeFetchError(err, timeout),
    };
  }
}

interface AppRow {
  id: string
  name: string
  agentName: string
  healthUrl: string
  lastStatus: string | null
  statusSince: Date | null
  streak: number
  lastAlertAt: Date | null
}

/**
 * Máquina de estados de un agente. Todo el estado vive en la base de datos
 * (MonitoredApp), así un reinicio de Railway no borra cooldowns ni rachas.
 *  - down/degraded: sube la racha; al alcanzar el umbral avisa (con cooldown de 4 h).
 *  - healthy tras una alerta enviada: avisa la recuperación con la duración de la caída.
 */
async function applyState(app: AppRow, result: HealthCheckResult): Promise<number> {
  const now = new Date()
  const status = result.status

  if (status === 'healthy' || status === 'unknown') {
    const wasAlerted = app.lastAlertAt != null && app.lastStatus !== 'healthy'
    if (wasAlerted) {
      const since = app.statusSince ?? app.lastAlertAt
      const sent = await sendAgentRecoveredEmail({
        agentName: app.agentName,
        appName: app.name,
        downtimeMs: since ? now.getTime() - since.getTime() : null,
      })
      if (!sent.success) console.error('[agent-monitor] recovery email failed for', app.agentName, '-', sent.error)
      else await logActivity('monitor', 'recovered', `${app.agentName}: ${app.name} volvió a funcionar`)
    }
    await prisma.monitoredApp.update({
      where: { id: app.id },
      data: { lastStatus: status, statusSince: app.lastStatus === status ? app.statusSince : now, streak: 0, lastAlertAt: null, lastCheckAt: now },
    })
    return 0
  }

  const sameAsBefore = app.lastStatus === status
  const streak = sameAsBefore ? app.streak + 1 : 1
  const statusSince = sameAsBefore && app.statusSince ? app.statusSince : now
  const threshold = status === 'down' ? DOWN_THRESHOLD : DEGRADED_THRESHOLD
  let lastAlertAt = app.lastAlertAt

  const cooledDown = !lastAlertAt || now.getTime() - lastAlertAt.getTime() > ALERT_COOLDOWN_MS
  if (streak >= threshold && cooledDown) {
    const sent = await sendAgentAlertEmail({
      agentName: app.agentName,
      appName: app.name,
      status,
      latency: result.latency,
      reason: result.message,
      since: statusSince,
    })
    if (sent.success) {
      lastAlertAt = now
      await logActivity('monitor', 'alert', `${app.agentName}: ${app.name} está ${status === 'down' ? 'caída' : 'lenta o con fallas'}${result.message ? ` (${result.message})` : ''}`)
    }
    // Si falla el envío NO se marca la alerta: el próximo chequeo lo reintenta.
    else console.error('[agent-monitor] alert email failed for', app.agentName, '-', sent.error)
  }

  await prisma.monitoredApp.update({
    where: { id: app.id },
    data: { lastStatus: status, statusSince, streak, lastAlertAt, lastCheckAt: now },
  })
  return streak
}

/** Chequea todas las apps, guarda los logs y actualiza el estado/alertas. */
export async function runAgentChecks(): Promise<HealthCheckResult[]> {
  const apps = await prisma.monitoredApp.findMany()

  const results: HealthCheckResult[] = await Promise.all(
    apps.map(async (app) => {
      const health = await checkAppHealth(app.healthUrl)
      const { errorDetail, ...healthFields } = health
      return {
        id: app.id,
        name: app.name,
        agentName: app.agentName,
        ...healthFields,
        message: errorDetail
          ?? (healthFields.status === 'degraded' ? 'Servicio degradado — respuesta no-2xx' : null),
      }
    })
  )

  // Uptime de las últimas 24 h para las apps que no lo reportan. Se calcula ANTES
  // de persistir el chequeo actual para no sesgar el número.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const computedUptime = new Map<string, number>()
  await Promise.all(
    results
      .filter((r) => r.uptime == null)
      .map(async (r) => {
        const logs = await prisma.agentHealthLog.findMany({
          where: { appId: r.id, checkedAt: { gte: since24h } },
          select: { status: true },
        })
        if (logs.length > 0) {
          const healthy = logs.filter((l: { status: string }) => l.status === 'healthy').length
          computedUptime.set(r.id, (healthy / logs.length) * 100)
        }
      })
  )

  const enriched = results.map((r) => ({ ...r, uptime: r.uptime ?? computedUptime.get(r.id) ?? null }))

  try {
    await prisma.agentHealthLog.createMany({
      data: enriched.map((r) => ({
        appId: r.id,
        status: r.status,
        latency: r.latency,
        uptime: r.uptime,
        message: r.message,
        errorRate: r.errorRate,
        memoryUsage: r.memoryUsage,
        cpuUsage: r.cpuUsage,
        databaseConnected: r.databaseConnected,
        httpStatusCode: r.httpStatusCode,
      })),
    })
  } catch (err) {
    console.error('Failed to persist agent health log:', err)
  }

  // Estado y alertas: una app que falla al actualizar no frena a las demás.
  await Promise.all(
    enriched.map(async (r) => {
      const app = apps.find((a) => a.id === r.id)
      if (!app) return
      try {
        r.consecutiveFailures = Math.max(r.consecutiveFailures, await applyState(app, r))
      } catch (err) {
        console.error('[agent-monitor] state update failed for', r.agentName, err)
      }
    })
  )

  return enriched
}
