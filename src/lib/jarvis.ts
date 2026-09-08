import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { getDayStart, getDayEnd } from './utils'

const JARVIS_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOOL_ITERATIONS = 4

export const JARVIS_SYSTEM_PROMPT = `Eres J.A.R.V.I.S., el asistente de IA personal e integrado de Marin Systems — un sistema de trading, productividad y negocios.
Hablas en español, con un tono cercano, directo y ligeramente ingenioso (como un asistente de confianza, no un chatbot genérico). Frases cortas, sin relleno.
Tienes acceso a herramientas para consultar datos REALES del usuario: trading, hábitos, agentes monitoreados, estado del día, metas, finanzas, agenda de hoy y empresas. Úsalas cuando la pregunta lo requiera — nunca inventes números.
Si no tienes una herramienta para algo, dilo con honestidad en vez de inventar.
Mantén las respuestas breves (máximo 3-4 frases) salvo que te pidan detalle — esto se puede leer en voz alta.`

export interface JarvisMessage {
  role: 'user' | 'assistant'
  content: string
}

const tools: Anthropic.Tool[] = [
  {
    name: 'get_trading_stats',
    description: 'Obtiene estadísticas reales de trading del usuario: win rate, número de trades, racha actual.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Ventana de días hacia atrás (default 30)' },
      },
    },
  },
  {
    name: 'get_habits_today',
    description: 'Obtiene los hábitos del usuario y cuáles ha completado hoy.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agents_status',
    description: 'Obtiene el estado de salud real de los agentes/apps monitoreadas (healthy/degraded/down).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_daily_state',
    description: 'Obtiene el estado mental y semáforo del día actual del usuario.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_pending_goals',
    description: 'Obtiene las metas activas (no completadas) del usuario.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_finance_summary',
    description: 'Obtiene el balance de cuentas, ingresos y gastos del mes actual.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_today_agenda',
    description: 'Obtiene los eventos y recordatorios de la agenda para hoy.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_companies_overview',
    description: 'Obtiene la lista de empresas del usuario (Command Center) con su peso estratégico y si están activas.',
    input_schema: { type: 'object', properties: {} },
  },
]

async function execTool(userId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_trading_stats': {
      const days = typeof input.days === 'number' && input.days > 0 ? input.days : 30
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      const trades = await prisma.trade.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: 'desc' },
        select: { result: true, pips: true, followedPlan: true, date: true },
      })
      const wins = trades.filter((t: { result: string }) => t.result === 'win').length
      const losses = trades.filter((t: { result: string }) => t.result === 'loss').length
      const winRate = trades.length > 0 ? (wins / trades.length) * 100 : null
      return {
        windowDays: days,
        totalTrades: trades.length,
        wins,
        losses,
        winRate: winRate != null ? Number(winRate.toFixed(1)) : null,
        lastTradeDate: trades[0]?.date ?? null,
      }
    }
    case 'get_habits_today': {
      const [habits, todayCompletions] = await Promise.all([
        prisma.habit.findMany({ where: { userId }, select: { id: true, name: true, emoji: true } }),
        prisma.habitCompletion.findMany({
          where: { userId, date: { gte: getDayStart(), lte: getDayEnd() } },
          select: { habitId: true },
        }),
      ])
      const doneIds = new Set(todayCompletions.map((c: { habitId: string }) => c.habitId))
      return {
        total: habits.length,
        completedToday: habits.filter((h: { id: string }) => doneIds.has(h.id)).length,
        pending: habits.filter((h: { id: string }) => !doneIds.has(h.id)).map((h: { name: string; emoji: string }) => `${h.emoji} ${h.name}`),
      }
    }
    case 'get_agents_status': {
      const apps = await prisma.monitoredApp.findMany({ select: { id: true, name: true, agentName: true } })
      const latestLogs = await Promise.all(
        apps.map((app: { id: string }) =>
          prisma.agentHealthLog.findFirst({ where: { appId: app.id }, orderBy: { checkedAt: 'desc' } })
        )
      )
      return apps.map((app: { id: string; name: string; agentName: string }, i: number) => ({
        name: app.name,
        agentName: app.agentName,
        status: latestLogs[i]?.status ?? 'unknown',
        message: latestLogs[i]?.message ?? null,
      }))
    }
    case 'get_daily_state': {
      const state = await prisma.dailyState.findFirst({
        where: { userId, date: { gte: getDayStart(), lte: getDayEnd() } },
      })
      return state
        ? { mentalState: state.mentalState, rutinaCompleted: state.rutinaCompleted, hasNews: state.hasNews }
        : { message: 'Sin registro del estado del día de hoy' }
    }
    case 'get_pending_goals': {
      const goals = await prisma.goal.findMany({
        where: { userId, completed: false },
        select: { title: true, deadline: true },
        take: 10,
      })
      return goals
    }
    case 'get_finance_summary': {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const [accounts, transactions] = await Promise.all([
        prisma.financeAccount.findMany({ where: { userId }, select: { name: true, balance: true } }),
        prisma.financeTransaction.findMany({
          where: { userId, date: { gte: monthStart } },
          select: { amount: true, type: true },
        }),
      ])
      const income = transactions.filter((t: { type: string }) => t.type === 'income').reduce((s: number, t: { amount: number }) => s + t.amount, 0)
      const expenses = transactions.filter((t: { type: string }) => t.type === 'expense').reduce((s: number, t: { amount: number }) => s + t.amount, 0)
      return {
        accounts: accounts.map((a: { name: string; balance: number }) => ({ name: a.name, balance: a.balance })),
        totalBalance: accounts.reduce((s: number, a: { balance: number }) => s + a.balance, 0),
        incomeThisMonth: income,
        expensesThisMonth: expenses,
        netThisMonth: income - expenses,
      }
    }
    case 'get_today_agenda': {
      const events = await prisma.event.findMany({
        where: { userId, date: { gte: getDayStart(), lte: getDayEnd() } },
        select: { title: true, time: true, type: true, completed: true, isForexNews: true },
        orderBy: { time: 'asc' },
      })
      return events
    }
    case 'get_companies_overview': {
      const companies = await prisma.cEOCompany.findMany({
        where: { userId },
        select: { name: true, isActive: true, strategicWeight: true },
      })
      return companies
    }
    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

export async function chatWithJarvis(userId: string, history: JarvisMessage[]): Promise<{ reply: string; history: JarvisMessage[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { reply: 'Mi conexión con Anthropic no está configurada (falta ANTHROPIC_API_KEY).', history }
  }

  const client = new Anthropic({ apiKey })
  let messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }))

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: JARVIS_MODEL,
        max_tokens: 700,
        system: JARVIS_SYSTEM_PROMPT,
        tools,
        messages,
      })

      if (response.stop_reason === 'tool_use') {
        messages = [...messages, { role: 'assistant', content: response.content }]
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await execTool(userId, block.name, block.input as Record<string, unknown>)
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
          }
        }
        messages = [...messages, { role: 'user', content: toolResults }]
        continue
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()

      const newHistory: JarvisMessage[] = [...history, { role: 'assistant', content: text || '...' }]
      return { reply: text || 'No tengo una respuesta para eso.', history: newHistory }
    }

    return { reply: 'Necesité demasiados pasos para responder eso — intenta preguntar algo más específico.', history }
  } catch (err) {
    const status = err instanceof APIError ? err.status : null
    if (status === 429) return { reply: 'Estoy saturado de solicitudes ahora mismo. Intenta en unos segundos.', history }
    console.error('[jarvis] error', err)
    return { reply: 'Tuve un problema procesando eso. Intenta de nuevo.', history }
  }
}
