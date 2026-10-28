// Modelo de la oficina: departamentos con sus agentes y el estado real de cada uno.
// Tipos y reglas puras aquí; la consulta a la base de datos vive en buildOffice().
import { prisma } from '@/lib/prisma'

export type AgentStatus = 'work' | 'sleep' | 'alert' | 'ghost'

export interface ScheduleSlot { day: number | null; from: number; to: number } // minutos desde 00:00, hora Colombia; day 0 = domingo

export interface OfficeAgent {
  id: string
  name: string
  role: string
  color: string // #rrggbb
  status: AgentStatus
  schedule: string
  model: string
  lastReport: string
  lastAt: string | null
  nextRun: string | null
  /** Para la demostración: cuándo "trabajaría" según su horario. */
  slots: ScheduleSlot[]
  /** Dónde se abre su trabajo en la app. */
  href?: string
  /** Lo que muestra mientras trabaja. */
  doing: string
}

export interface OfficeDepartment {
  id: string
  name: string
  kind: 'monitoring' | 'marketing' | 'direction'
  accent: string
  agents: OfficeAgent[]
  stats: { label: string; value: number }[]
  note: string
}

const COLORS = { research: '#4fb6d9', writer: '#b58cff', checker: '#f2b84b', analyst: '#f0645c', ghost: '#6b7592' }
// Una corrida que terminó hace poco se muestra como "trabajando": son tareas de segundos o minutos.
const RECENT_MS = 20 * 60 * 1000
const BOGOTA_OFFSET_MIN = -5 * 60

/** Minutos desde 00:00 en Colombia (UTC-5, sin horario de verano). */
export function colombiaMinutes(d: Date): { day: number; minutes: number } {
  const t = new Date(d.getTime() + BOGOTA_OFFSET_MIN * 60 * 1000)
  return { day: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() }
}

const hhmm = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** Próxima vez que cae en alguno de los horarios, en texto ("hoy 7:00 AM", "mañana 7:00 AM", "domingo 8:00 AM"). */
export function nextRunText(slots: ScheduleSlot[], now: Date): string | null {
  if (slots.length === 0) return null
  const { day, minutes } = colombiaMinutes(now)
  for (let add = 0; add < 8; add++) {
    const d = (day + add) % 7
    const starts = slots.filter((s) => (s.day === null || s.day === d) && (add > 0 || s.from > minutes)).map((s) => s.from)
    if (starts.length) return `${add === 0 ? 'hoy' : add === 1 ? 'mañana' : DAY_NAMES[d]} ${hhmm(Math.min(...starts))}`
  }
  return null
}

const short = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function ghost(id: string, name: string, role: string, note: string): OfficeAgent {
  return { id, name, role, color: COLORS.ghost, status: 'ghost', schedule: 'Aún sin horario', model: 'Por definir', lastReport: note, lastAt: null, nextRun: null, slots: [], doing: '' }
}

export async function buildOffice(userId: string, now = new Date()): Promise<OfficeDepartment[]> {
  const departments: OfficeDepartment[] = []

  // ── Monitoreo: cada app vigilada tiene su agente (Ángela, etc.) ──
  const apps = await prisma.monitoredApp.findMany({
    orderBy: { createdAt: 'asc' },
    include: { healthLogs: { orderBy: { checkedAt: 'desc' }, take: 1 } },
  })
  const monitoring: OfficeAgent[] = apps.map((a) => {
    const log = a.healthLogs[0]
    const bad = a.lastStatus === 'down' || a.lastStatus === 'degraded'
    const detail = log
      ? `${a.lastStatus === 'healthy' ? 'Todo bien' : a.lastStatus === 'down' ? 'Caída' : a.lastStatus === 'degraded' ? 'Degradada' : 'Sin datos'}${log.latency != null ? ` · ${log.latency} ms` : ''}${log.message ? ` · ${log.message}` : ''}`
      : 'Todavía no hay chequeos.'
    return {
      id: `app-${a.id}`,
      name: a.agentName,
      role: a.role ?? `Vigila ${a.name}`,
      color: a.color,
      status: bad ? 'alert' : a.lastCheckAt ? 'work' : 'sleep',
      schedule: 'Cada 5 minutos, todo el día',
      model: 'Sin IA (chequeo de salud)',
      lastReport: short(`${a.name}: ${detail}`),
      lastAt: a.lastCheckAt?.toISOString() ?? null,
      nextRun: null,
      slots: [{ day: null, from: 0, to: 1440 }],
      href: '/agentes',
      doing: `Revisando ${a.name}…`,
    }
  })
  departments.push({
    id: 'monitoring',
    name: 'Monitoreo de apps',
    kind: 'monitoring',
    accent: '#4fd18b',
    agents: monitoring,
    stats: [
      { label: 'apps vigiladas', value: apps.length },
      { label: 'con problemas', value: monitoring.filter((m) => m.status === 'alert').length },
    ],
    note: apps.length ? 'Cada app tiene su agente. Si una cae, te avisa por correo.' : 'Aún no hay apps vigiladas: se agregan en Agentes.',
  })

  // ── Marketing: un departamento por empresa activa ──
  const companies = await prisma.cEOCompany.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, color: true } })
  const runs = await prisma.cronRun.findMany({
    where: { job: { in: ['topic-research', 'auto-content', 'news-watch', 'metrics-report'] }, startedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) } },
    orderBy: { startedAt: 'desc' },
    take: 200,
  })
  const lastRun = (job: string) => runs.find((r) => r.job === job)
  const statusOf = (jobs: string[]): { status: AgentStatus; at: Date | null } => {
    const rs = jobs.map(lastRun).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    const r = rs[0]
    if (!r) return { status: 'sleep', at: null }
    if (!r.ok && r.finishedAt) return { status: 'alert', at: r.startedAt }
    return { status: now.getTime() - r.startedAt.getTime() < RECENT_MS ? 'work' : 'sleep', at: r.startedAt }
  }

  for (const c of companies) {
    const [pending, queued, published, lastPost, lastChecked, metrics, topics, profile] = await Promise.all([
      prisma.generatedPost.groupBy({ by: ['groupId'], where: { companyId: c.id, status: 'pending_review' } }).then((g) => g.length),
      prisma.generatedPost.count({ where: { companyId: c.id, status: { in: ['approved', 'publishing'] } } }),
      prisma.generatedPost.count({ where: { companyId: c.id, status: 'published', publishedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } } }),
      prisma.generatedPost.findFirst({ where: { companyId: c.id, source: { in: ['auto', 'news'] } }, orderBy: { createdAt: 'desc' }, select: { topic: true, createdAt: true } }),
      prisma.generatedPost.findFirst({ where: { companyId: c.id, factCheckedAt: { not: null } }, orderBy: { factCheckedAt: 'desc' }, select: { factCheck: true, factCheckedAt: true } }),
      prisma.agentReport.findFirst({ where: { companyId: c.id, kind: 'metrics' }, orderBy: { createdAt: 'desc' } }),
      prisma.agentReport.findFirst({ where: { companyId: c.id, kind: 'topics' }, orderBy: { createdAt: 'desc' } }),
      prisma.brandProfile.findUnique({ where: { companyId: c.id }, select: { autoEnabled: true, newsEnabled: true } }),
    ])
    const on = !!(profile?.autoEnabled || profile?.newsEnabled)
    const off = on ? '' : ' (piloto automático apagado)'
    const research = statusOf(['topic-research'])
    const writer = statusOf(['auto-content', 'news-watch'])
    const analyst = statusOf(['metrics-report'])
    const fc = lastChecked?.factCheck as { summary?: string; verdict?: string } | null
    const topicList = (topics?.content as { topics?: { angle: string }[] } | null)?.topics?.map((t) => t.angle).join(' · ')

    const slotsResearch: ScheduleSlot[] = [{ day: null, from: 7 * 60, to: 8 * 60 }]
    const slotsWriter: ScheduleSlot[] = [{ day: 0, from: 9 * 60, to: 10 * 60 }, { day: null, from: 10 * 60, to: 11 * 60 }]
    const slotsChecker: ScheduleSlot[] = [{ day: 0, from: 10 * 60, to: 11 * 60 }, { day: null, from: 11 * 60, to: 12 * 60 }]
    const slotsAnalyst: ScheduleSlot[] = [{ day: 0, from: 8 * 60, to: 9 * 60 }]

    const agents: OfficeAgent[] = [
      { id: `${c.id}-research`, name: 'Investigador', role: 'Investigador de temas', color: COLORS.research, status: on ? research.status : 'sleep', schedule: 'Todos los días · 7:00 AM', model: 'Haiku + búsqueda web',
        lastReport: topicList ? short(`Temas propuestos: ${topicList}`) : `Todavía no ha propuesto temas${off}.`, lastAt: topics?.createdAt.toISOString() ?? research.at?.toISOString() ?? null, nextRun: nextRunText(slotsResearch, now), slots: slotsResearch, href: '/command-center', doing: 'Buscando fechas límite y noticias del día…' },
      { id: `${c.id}-writer`, name: 'Redactor', role: 'Redactor de contenido', color: COLORS.writer, status: on ? writer.status : 'sleep', schedule: 'Domingo 9:00 AM (semana) · diario 10:00 AM (noticias)', model: 'Sonnet',
        lastReport: lastPost ? short(`Último post: "${lastPost.topic}"`) : `Todavía no ha escrito posts${off}.`, lastAt: lastPost?.createdAt.toISOString() ?? writer.at?.toISOString() ?? null, nextRun: nextRunText(slotsWriter, now), slots: slotsWriter, href: '/command-center', doing: 'Escribiendo un post para todas las redes…' },
      { id: `${c.id}-checker`, name: 'Verificador', role: 'Verificador de datos', color: COLORS.checker, status: on ? (writer.status === 'work' ? 'work' : writer.status === 'alert' ? 'alert' : 'sleep') : 'sleep', schedule: 'Justo después de cada post nuevo', model: 'Sonnet + búsqueda web',
        lastReport: fc?.summary ? short(fc.summary) : 'Todavía no ha verificado posts.', lastAt: lastChecked?.factCheckedAt?.toISOString() ?? null, nextRun: nextRunText(slotsChecker, now), slots: slotsChecker, href: '/command-center', doing: 'Comparando montos y fechas con IRS.gov…' },
      { id: `${c.id}-analyst`, name: 'Analista', role: 'Analista de métricas', color: COLORS.analyst, status: on ? analyst.status : 'sleep', schedule: 'Domingos · 8:00 AM', model: 'Haiku',
        lastReport: metrics ? short(String((metrics.content as { summary?: string }).summary ?? 'Informe listo.')) : 'Aún sin informe: necesita 3 posts publicados con números.', lastAt: metrics?.createdAt.toISOString() ?? analyst.at?.toISOString() ?? null, nextRun: nextRunText(slotsAnalyst, now), slots: slotsAnalyst, href: '/command-center', doing: 'Leyendo alcance, likes y guardados de la semana…' },
      ghost('video', 'Video (próximamente)', 'Videos con avatar de la marca', 'Puesto reservado: se activa cuando elijamos el servicio de video y probemos costos.'),
      ghost('community', 'Comunidad (próximamente)', 'Responde comentarios y mensajes', 'Puesto reservado: leerá los comentarios, responderá los simples y te pasará los que necesiten una persona.'),
    ]
    departments.push({
      id: `mkt-${c.id}`,
      name: c.name,
      kind: 'marketing',
      accent: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#7aa2ff',
      agents,
      stats: [{ label: 'por aprobar', value: pending }, { label: 'programados', value: queued }, { label: 'publicados (7 días)', value: published }],
      note: pending ? `${pending} post${pending === 1 ? '' : 's'} esperando tu aprobación. Nada sale sin que lo revises.` : 'Nada pendiente por aprobar.',
    })
  }

  // ── Dirección: Jarvis y los agentes generales que vengan ──
  departments.push({
    id: 'direction',
    name: 'Dirección',
    kind: 'direction',
    accent: '#d6b35a',
    agents: [
      { id: 'jarvis', name: 'Jarvis', role: 'Asistente general', color: '#d6b35a', status: 'sleep', schedule: 'Cuando le hablas', model: 'Sonnet', lastReport: 'Responde cuando lo llamas desde el botón JARVIS.', lastAt: null, nextRun: null, slots: [], doing: '', href: '/dashboard' },
      ghost('finance', 'Finanzas (próximamente)', 'Revisa gastos y flujo de caja', 'Puesto reservado para un agente de finanzas.'),
    ],
    stats: [],
    note: 'Agentes que sirven a todas las empresas.',
  })

  return departments
}
