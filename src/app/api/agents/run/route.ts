import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { agentEnabled, runAs, type AgentKey } from '@/lib/agent-ledger'
import { runLogged } from '@/lib/cron-run'
import { runAgentChecks } from '@/lib/agent-monitor'
import { factCheckGroup } from '@/lib/auto-content'
import { sendNextArticle } from '@/lib/blog-queue'
import { writeBlogArticle } from '@/lib/blog-writer'
import { POST as researchPost } from '@/app/api/ceo/cron/topic-research/route'
import { POST as contentPost } from '@/app/api/ceo/cron/auto-content/route'
import { POST as metricsPost } from '@/app/api/ceo/cron/metrics-report/route'

export const maxDuration = 300

// "Ejecutar ahora" desde la oficina de agentes: lanza el trabajo de UN agente para SU empresa, con la misma lógica
// del proceso automático (mismas reglas, registro y avisos). Los trabajos largos siguen por detrás; el resultado
// aparece en la tarjeta del agente y en la bandeja.
const running = new Set<string>()

type Reply = { state: 'started' | 'running' | 'done' | 'idle' | 'error'; message: string }
const reply = (r: Reply, status = 200) => NextResponse.json(r, { status })

function viaCron(handler: (req: Request) => Promise<Response>, req: NextRequest, body: Record<string, unknown>) {
  return handler(new Request(req.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const { agentId } = (await req.json().catch(() => ({}))) as { agentId?: string }
  // Monitoreo: revisa la salud de las apps ahora mismo (sin IA, sin costo).
  if (agentId?.startsWith('app-')) {
    try {
      const results = await runAgentChecks()
      const r = results.find((x) => `app-${x.id}` === agentId)
      if (!r) return reply({ state: 'error', message: 'No encontré esa app.' }, 404)
      const label = r.status === 'healthy' ? 'todo bien' : r.status === 'down' ? 'CAÍDA' : r.status === 'degraded' ? 'degradada' : 'sin datos'
      return reply({ state: 'done', message: `${r.name}: ${label}${r.latency != null ? ` · ${r.latency} ms` : ''}${r.message ? ` · ${r.message}` : ''}.` })
    } catch (err) {
      console.error('[agents/run] monitoreo', err)
      return reply({ state: 'error', message: 'No se pudo revisar la app.' }, 500)
    }
  }
  if (!process.env.CRON_SECRET) return reply({ state: 'error', message: 'CRON_SECRET no está configurado en Railway.' }, 500)
  if (!process.env.ANTHROPIC_API_KEY) return reply({ state: 'error', message: 'ANTHROPIC_API_KEY no está configurado en Railway.' }, 500)
  const m = agentId?.match(/^(?:blog-(.+)|(.+)-(research|writer|checker|analyst))$/)
  if (!agentId || !m) return reply({ state: 'error', message: 'Este agente no se puede ejecutar a mano.' }, 400)
  const kind = m[1] ? 'blog' : m[3]
  const companyId = m[1] ?? m[2]
  const company = await prisma.cEOCompany.findFirst({ where: { id: companyId, userId }, select: { id: true, name: true } })
  if (!company) return reply({ state: 'error', message: 'No encontré la empresa de este agente.' }, 404)

  const agentKey: AgentKey = ({ research: 'juan', writer: 'fernanda', checker: 'felipe', analyst: 'samantha', blog: 'luis' } as const)[kind as 'research']
  if (!(await agentEnabled(agentKey))) return reply({ state: 'idle', message: 'Este agente está apagado: enciéndelo en Command Center → Equipo.' })
  if (running.has(agentId)) return reply({ state: 'running', message: 'Ya está trabajando en esto: espera a que termine.' })

  try {
    // ── Trabajos que ya existen como proceso automático: investigador, redactor y analista ──
    if (kind === 'research' || kind === 'writer' || kind === 'analyst') {
      const profile = await prisma.brandProfile.findFirst({ where: { companyId }, select: { autoEnabled: true, newsEnabled: true } })
      if (kind !== 'analyst' && !profile?.autoEnabled) return reply({ state: 'idle', message: `El piloto automático de ${company.name} está apagado: enciéndelo en Empresas → Configurar marca.` })
      if (kind === 'analyst' && !profile?.autoEnabled && !profile?.newsEnabled) return reply({ state: 'idle', message: `El piloto automático de ${company.name} está apagado.` })
      const handler = kind === 'research' ? researchPost : kind === 'writer' ? contentPost : metricsPost
      const res = await viaCron(handler, req, { companyId })
      const data = (await res.json().catch(() => ({}))) as { running?: boolean; error?: string }
      if (!res.ok && res.status !== 202) return reply({ state: 'error', message: data.error ?? 'No se pudo lanzar el trabajo.' }, 502)
      if (data.running) return reply({ state: 'running', message: 'Ya hay una corrida de este trabajo en curso: espera a que termine.' })
      return reply({ state: 'started', message: kind === 'research' ? 'Está buscando temas nuevos…' : kind === 'writer' ? 'Está redactando la tanda de posts…' : 'Está analizando las métricas…' })
    }

    // ── Verificador: revisa los datos de los posts pendientes que aún no tienen verificación ──
    if (kind === 'checker') {
      const pending = await prisma.generatedPost.findMany({ where: { companyId, userId, status: 'pending_review', factCheckedAt: null }, select: { id: true, groupId: true }, orderBy: { createdAt: 'desc' }, take: 40 })
      const groups = Array.from(new Set(pending.map((p) => p.groupId).filter((g): g is string => !!g))).slice(0, 4)
      if (groups.length === 0) return reply({ state: 'idle', message: 'No hay posts pendientes sin verificar: todo está al día.' })
      running.add(agentId)
      void runLogged('manual-fact-check', () => runAs('felipe', async () => {
        for (const g of groups) await factCheckGroup(g)
        return { company: company.name, groups: groups.length }
      }, companyId)).catch((e) => console.error('[agents/run] verificador falló:', e)).finally(() => running.delete(agentId))
      return reply({ state: 'started', message: `Está verificando los datos de ${groups.length} ${groups.length === 1 ? 'contenido' : 'contenidos'}…` })
    }

    // ── Luis (blog): manda el siguiente artículo listo de la cola; si no hay y puede escribir con IA, escribe uno ──
    const ready = await prisma.blogArticle.count({ where: { companyId, status: 'ready' } })
    if (ready > 0) {
      const r = await runAs('luis', () => sendNextArticle(companyId), companyId)
      return r.ok ? reply({ state: 'done', message: `Mandó «${r.title}» al blog como borrador. Revísalo y publícalo desde tu panel del blog.` }) : reply({ state: 'error', message: r.error ?? 'No se pudo enviar al blog.' }, 502)
    }
    const prof = await prisma.brandProfile.findFirst({ where: { companyId }, select: { blogEnabled: true, blogAiWrite: true } })
    if (!prof?.blogEnabled) return reply({ state: 'idle', message: `El blog de ${company.name} no está activado: abre su trabajo y guarda el perfil del blog.` })
    if (!prof.blogAiWrite) return reply({ state: 'idle', message: 'No hay artículos listos en la cola. Súbelos en "Artículos listos" o activa que Luis escriba con IA en el perfil del blog.' })
    running.add(agentId)
    void runLogged('blog-article', async () => {
      const r = await writeBlogArticle({ companyId })
      if (!r.ok) throw new Error(r.error ?? 'No se pudo escribir el artículo')
      return { summary: [{ company: company.name, created: r.created?.length ?? 0, topic: r.topic }] }
    }).catch((e) => console.error('[agents/run] Luis falló:', e)).finally(() => running.delete(agentId))
    return reply({ state: 'started', message: 'Está escribiendo un artículo (español e inglés) para mandarlo al blog como borrador…' })
  } catch (err) {
    console.error('[agents/run]', err)
    return reply({ state: 'error', message: 'No se pudo ejecutar el agente.' }, 500)
  }
}
