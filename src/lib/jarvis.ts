import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { prisma } from './prisma'
import { getDayStart, getDayEnd, getTodayString } from './utils'

// Bumped from Haiku to Sonnet for write-capability: the propose-then-confirm
// discipline below (never write with confirmed:true on the same turn it's
// proposed) needs more reliable instruction-following now that Jarvis can
// actually change trading/financial data, not just report on it.
const JARVIS_MODEL = 'claude-sonnet-5'
const MAX_TOOL_ITERATIONS = 6

export const JARVIS_SYSTEM_PROMPT = `Eres J.A.R.V.I.S., el compañero de IA de Andrés — no un empleado esperando instrucciones, sino alguien que ya está metido en su día a día: su trading, sus empresas, sus hábitos. Conoces el contexto, así que no preguntas "¿qué necesitas?" como si fueras un mostrador de atención al cliente — reaccionas a lo que te dice como lo haría alguien cercano que ya sabe de qué está hablando.
Hablas en español, con calidez y cercanía real (no frialdad ni tono de servicio), directo y con un toque de personalidad — como el compañero de confianza de siempre, no un asistente genérico. Frases cortas, sin relleno — esto se lee en voz alta.
Evita aperturas frías tipo "¿en qué puedo ayudarte?" o "¿qué necesitas?" — en vez de eso, entra directo al tema, comenta algo relevante, o responde como si la conversación ya viniera fluyendo.
Tienes herramientas de LECTURA (consultan datos reales: trading, hábitos, agentes, estado del día, metas, finanzas, agenda, empresas) y herramientas de ACCIÓN (crean o modifican datos reales: crear hábito, completar hábito, registrar trade, crear evento, crear tarea, registrar transacción, crear meta, actualizar el estado del día).

REGLA INQUEBRANTABLE para las herramientas de acción: cada una recibe un parámetro "confirmed".
1. La PRIMERA vez que decidas ejecutar una acción, llama la herramienta con confirmed:false. Esto NO modifica nada — te devuelve un resumen de lo que se haría.
2. Di ese resumen al usuario en tu respuesta y pregunta "¿confirmas?" — y ESPERA. No llames la herramienta de nuevo en el mismo turno.
3. Solo cuando el usuario confirme explícitamente en un turno posterior (sí, confirmo, dale, hazlo, exacto, correcto), llama la MISMA herramienta con los MISMOS datos y confirmed:true — ahí sí se guarda.
4. Si el usuario dice que no, cambia algo, o cambia de tema, no llames la herramienta con confirmed:true — cancela y sigue la conversación.
Nunca saltes el paso de confirmación, sin importar qué tan simple parezca la acción.

Para las herramientas de lectura, úsalas libremente cuando la pregunta lo requiera — nunca inventes números. Si no tienes una herramienta para algo, dilo con honestidad en vez de inventar.
Mantén las respuestas breves (máximo 3-4 frases) salvo que te pidan detalle.`

export interface JarvisMessage {
  role: 'user' | 'assistant'
  content: string
}

const CONFIRMED_PARAM = {
  confirmed: {
    type: 'boolean',
    description: 'false la primera vez (solo previsualiza, no guarda nada); true solo después de que el usuario confirmó explícitamente en un turno posterior.',
  },
} as const

const tools: Anthropic.Tool[] = [
  // ── Lectura ──────────────────────────────────────────────
  {
    name: 'get_trading_stats',
    description: 'Obtiene estadísticas reales de trading del usuario: win rate, número de trades, racha actual.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Ventana de días hacia atrás (default 30)' } },
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
  // ── Acción (requieren confirmed:true en un segundo paso) ──
  {
    name: 'create_habit',
    description: 'Crea un hábito nuevo.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del hábito' },
        emoji: { type: 'string', description: 'Un emoji representativo' },
        category: { type: 'string', description: 'Categoría libre, ej: salud, trading, personal' },
        frequency: { type: 'string', description: "'diario' o 'semanal'" },
        isPreMarket: { type: 'boolean', description: 'true si es parte de la rutina pre-mercado' },
        ...CONFIRMED_PARAM,
      },
      required: ['name'],
    },
  },
  {
    name: 'complete_habit',
    description: 'Marca un hábito existente como completado hoy, buscándolo por nombre.',
    input_schema: {
      type: 'object',
      properties: {
        habitName: { type: 'string', description: 'Nombre (o parte del nombre) del hábito a completar' },
        ...CONFIRMED_PARAM,
      },
      required: ['habitName'],
    },
  },
  {
    name: 'create_trade',
    description: 'Registra un trade de trading.',
    input_schema: {
      type: 'object',
      properties: {
        pair: { type: 'string', description: 'Par, ej: EURUSD' },
        result: { type: 'string', description: "'win', 'loss' o 'be' (breakeven)" },
        pips: { type: 'number' },
        setup: { type: 'string' },
        emotion: { type: 'string' },
        followedPlan: { type: 'boolean' },
        notes: { type: 'string' },
        ...CONFIRMED_PARAM,
      },
      required: ['pair', 'result'],
    },
  },
  {
    name: 'create_event',
    description: 'Agrega un evento o recordatorio a la agenda.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'Fecha ISO (YYYY-MM-DD); si no se especifica, hoy' },
        time: { type: 'string', description: "Hora libre, ej: '3:00pm'" },
        type: { type: 'string', description: "Tipo libre, ej: 'reunion', 'personal', 'recordatorio'" },
        ...CONFIRMED_PARAM,
      },
      required: ['title'],
    },
  },
  {
    name: 'create_company_task',
    description: 'Crea una tarea para una empresa (buscada por nombre).',
    input_schema: {
      type: 'object',
      properties: {
        companyName: { type: 'string' },
        title: { type: 'string' },
        priority: { type: 'string', description: "'alta', 'media' o 'baja'" },
        ...CONFIRMED_PARAM,
      },
      required: ['companyName', 'title'],
    },
  },
  {
    name: 'create_finance_transaction',
    description: 'Registra un ingreso o gasto.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Monto positivo' },
        type: { type: 'string', description: "'income' o 'expense'" },
        accountName: { type: 'string', description: 'Nombre de la cuenta (opcional, busca por nombre)' },
        note: { type: 'string' },
        ...CONFIRMED_PARAM,
      },
      required: ['amount', 'type'],
    },
  },
  {
    name: 'create_goal',
    description: 'Crea una meta nueva.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        deadline: { type: 'string', description: 'Fecha ISO opcional' },
        ...CONFIRMED_PARAM,
      },
      required: ['title'],
    },
  },
  {
    name: 'update_daily_state',
    description: 'Actualiza el estado del día de hoy (ánimo, rutina completada, noticias de alto impacto).',
    input_schema: {
      type: 'object',
      properties: {
        mentalState: { type: 'number', description: '1 a 5' },
        rutinaCompleted: { type: 'boolean' },
        hasNews: { type: 'boolean' },
        ...CONFIRMED_PARAM,
      },
      required: [],
    },
  },
]

function pending(summary: string, extra?: Record<string, unknown>) {
  return { pending: true, summary, note: 'No se guardó nada todavía. Dile este resumen al usuario y pide confirmación explícita antes de volver a llamar esta herramienta con confirmed:true.', ...extra }
}

async function resolveHabit(userId: string, name: string) {
  const habits = await prisma.habit.findMany({ where: { userId }, select: { id: true, name: true, emoji: true } })
  const match = habits.find((h: { name: string }) => h.name.toLowerCase().includes(name.toLowerCase()))
  return { match, options: habits.map((h: { name: string }) => h.name) }
}

async function resolveCeoCompany(userId: string, name: string) {
  // Voice actions target the operational Company (has .tasks), linked via CEOCompany.
  const companies = await prisma.company.findMany({ where: { userId }, select: { id: true, name: true } })
  const match = companies.find((c: { name: string }) => c.name.toLowerCase().includes(name.toLowerCase()))
  return { match, options: companies.map((c: { name: string }) => c.name) }
}

async function resolveAccount(userId: string, name: string | undefined) {
  const accounts = await prisma.financeAccount.findMany({ where: { userId }, select: { id: true, name: true } })
  if (!name) return { match: accounts[0], options: accounts.map((a: { name: string }) => a.name) }
  const match = accounts.find((a: { name: string }) => a.name.toLowerCase().includes(name.toLowerCase()))
  return { match, options: accounts.map((a: { name: string }) => a.name) }
}

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
      return prisma.goal.findMany({ where: { userId, completed: false }, select: { title: true, deadline: true }, take: 10 })
    }
    case 'get_finance_summary': {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const [accounts, transactions] = await Promise.all([
        prisma.financeAccount.findMany({ where: { userId }, select: { name: true, balance: true } }),
        prisma.financeTransaction.findMany({ where: { userId, date: { gte: monthStart } }, select: { amount: true, type: true } }),
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
      return prisma.event.findMany({
        where: { userId, date: { gte: getDayStart(), lte: getDayEnd() } },
        select: { title: true, time: true, type: true, completed: true, isForexNews: true },
        orderBy: { time: 'asc' },
      })
    }
    case 'get_companies_overview': {
      return prisma.cEOCompany.findMany({ where: { userId }, select: { name: true, isActive: true, strategicWeight: true } })
    }

    // ── Acción ──────────────────────────────────────────────
    case 'create_habit': {
      const habitName = typeof input.name === 'string' ? input.name.trim() : ''
      if (!habitName) return { error: 'Falta el nombre del hábito' }
      const emoji = typeof input.emoji === 'string' && input.emoji ? input.emoji : '✅'
      const category = typeof input.category === 'string' && input.category ? input.category : 'personal'
      const frequency = typeof input.frequency === 'string' && input.frequency ? input.frequency : 'diario'
      const isPreMarket = input.isPreMarket === true
      if (input.confirmed !== true) {
        return pending(`Crear hábito "${emoji} ${habitName}" (${category}, ${frequency}${isPreMarket ? ', pre-mercado' : ''})`)
      }
      const habit = await prisma.habit.create({ data: { userId, name: habitName, emoji, category, frequency, isPreMarket } })
      return { success: true, habit }
    }
    case 'complete_habit': {
      const habitName = typeof input.habitName === 'string' ? input.habitName : ''
      const { match, options } = await resolveHabit(userId, habitName)
      if (!match) return { error: `No encontré un hábito llamado "${habitName}". Hábitos existentes: ${options.join(', ') || 'ninguno'}` }
      if (input.confirmed !== true) return pending(`Marcar "${match.emoji} ${match.name}" como completado hoy`)
      // Range-check (not an exact-key upsert) because /api/habits/complete — the
      // app's own UI route — stores completions at noon Bogotá time, not midnight
      // (getDayStart()). An exact-match upsert here would miss that row and
      // silently create a duplicate completion for the same habit/day.
      const alreadyDone = await prisma.habitCompletion.findFirst({
        where: { habitId: match.id, userId, date: { gte: getDayStart(), lte: getDayEnd() } },
      })
      if (!alreadyDone) {
        await prisma.habitCompletion.create({
          data: { habitId: match.id, userId, date: new Date(`${getTodayString()}T12:00:00-05:00`) },
        })
      }
      return { success: true, habit: match.name }
    }
    case 'create_trade': {
      const pair = typeof input.pair === 'string' ? input.pair.trim().toUpperCase() : ''
      const result = typeof input.result === 'string' ? input.result.toLowerCase() : ''
      if (!pair || !['win', 'loss', 'be'].includes(result)) return { error: "Falta pair o result válido ('win'|'loss'|'be')" }
      const pips = typeof input.pips === 'number' ? input.pips : null
      const setup = typeof input.setup === 'string' ? input.setup : null
      const emotion = typeof input.emotion === 'string' ? input.emotion : null
      const followedPlan = input.followedPlan === true
      const notes = typeof input.notes === 'string' ? input.notes : null
      if (input.confirmed !== true) {
        return pending(`Registrar trade: ${pair}, resultado ${result}${pips != null ? `, ${pips} pips` : ''}${followedPlan ? ', siguió el plan' : ''}`)
      }
      const trade = await prisma.trade.create({ data: { userId, date: new Date(), pair, result, pips, setup, emotion, followedPlan, notes } })
      return { success: true, trade }
    }
    case 'create_event': {
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      if (!title) return { error: 'Falta el título del evento' }
      // Same noon-Bogotá convention as POST /api/events — a plain `new Date(dateStr)`
      // parses a bare "YYYY-MM-DD" as UTC midnight, which renders as the PREVIOUS
      // day once the Agenda UI formats it in America/Bogota (UTC-5).
      const dateStr = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : getTodayString()
      const dateInput = new Date(`${dateStr}T12:00:00-05:00`)
      const time = typeof input.time === 'string' ? input.time : null
      const type = typeof input.type === 'string' && input.type ? input.type : 'personal'
      if (input.confirmed !== true) {
        return pending(`Agregar a la agenda: "${title}" el ${dateInput.toLocaleDateString('es-CO')}${time ? ` a las ${time}` : ''}`)
      }
      const event = await prisma.event.create({ data: { userId, title, date: dateInput, time, type, isForexNews: false } })
      return { success: true, event }
    }
    case 'create_company_task': {
      const companyName = typeof input.companyName === 'string' ? input.companyName : ''
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      if (!title) return { error: 'Falta el título de la tarea' }
      const { match, options } = await resolveCeoCompany(userId, companyName)
      if (!match) return { error: `No encontré la empresa "${companyName}". Empresas existentes: ${options.join(', ') || 'ninguna'}` }
      const priority = typeof input.priority === 'string' && ['alta', 'media', 'baja'].includes(input.priority) ? input.priority : 'media'
      if (input.confirmed !== true) {
        return pending(`Crear tarea "${title}" (prioridad ${priority}) en la empresa ${match.name}`)
      }
      const task = await prisma.companyTask.create({ data: { companyId: match.id, userId, title, priority } })
      return { success: true, task }
    }
    case 'create_finance_transaction': {
      const amount = typeof input.amount === 'number' ? Math.abs(input.amount) : 0
      const type = typeof input.type === 'string' ? input.type.toLowerCase() : ''
      if (amount <= 0 || !['income', 'expense'].includes(type)) return { error: "Falta amount o type válido ('income'|'expense')" }
      const note = typeof input.note === 'string' ? input.note : null
      const { match: account } = await resolveAccount(userId, typeof input.accountName === 'string' ? input.accountName : undefined)
      if (input.confirmed !== true) {
        return pending(`Registrar ${type === 'income' ? 'ingreso' : 'gasto'} de ${amount}${account ? ` en la cuenta ${account.name}` : ''}${note ? ` — ${note}` : ''}`)
      }
      const transaction = await prisma.financeTransaction.create({
        data: { userId, date: new Date(), amount, type, note, accountId: account?.id ?? null },
      })
      if (account) {
        await prisma.financeAccount.update({
          where: { id: account.id },
          data: { balance: { increment: type === 'income' ? amount : -amount } },
        })
      }
      return { success: true, transaction }
    }
    case 'create_goal': {
      const title = typeof input.title === 'string' ? input.title.trim() : ''
      if (!title) return { error: 'Falta el título de la meta' }
      const description = typeof input.description === 'string' ? input.description : null
      const deadline = typeof input.deadline === 'string' && !isNaN(Date.parse(input.deadline)) ? new Date(input.deadline) : null
      if (input.confirmed !== true) {
        return pending(`Crear meta "${title}"${deadline ? ` con fecha límite ${deadline.toLocaleDateString('es-CO')}` : ''}`)
      }
      const goal = await prisma.goal.create({ data: { userId, title, description, deadline } })
      return { success: true, goal }
    }
    case 'update_daily_state': {
      const mentalState = typeof input.mentalState === 'number' ? Math.max(1, Math.min(5, Math.round(input.mentalState))) : undefined
      const rutinaCompleted = typeof input.rutinaCompleted === 'boolean' ? input.rutinaCompleted : undefined
      const hasNews = typeof input.hasNews === 'boolean' ? input.hasNews : undefined
      if (mentalState === undefined && rutinaCompleted === undefined && hasNews === undefined) {
        return { error: 'No diste ningún campo para actualizar' }
      }
      if (input.confirmed !== true) {
        const parts = [
          mentalState !== undefined && `ánimo ${mentalState}/5`,
          rutinaCompleted !== undefined && `rutina ${rutinaCompleted ? 'completada' : 'no completada'}`,
          hasNews !== undefined && `noticias de alto impacto: ${hasNews ? 'sí' : 'no'}`,
        ].filter(Boolean)
        return pending(`Actualizar el estado de hoy: ${parts.join(', ')}`)
      }
      // Same exact convention as POST /api/daily-state (the app's own UI route):
      // one row per day, keyed by noon Bogotá time via the real userId_date
      // unique constraint — not getDayStart() (midnight), which would create a
      // second, disconnected row for "today" instead of updating the real one.
      const stateDate = new Date(`${getTodayString()}T12:00:00-05:00`)
      const state = await prisma.dailyState.upsert({
        where: { userId_date: { userId, date: stateDate } },
        update: {
          ...(mentalState !== undefined ? { mentalState } : {}),
          ...(rutinaCompleted !== undefined ? { rutinaCompleted } : {}),
          ...(hasNews !== undefined ? { hasNews } : {}),
        },
        create: { userId, date: stateDate, mentalState: mentalState ?? 3, rutinaCompleted: rutinaCompleted ?? false, hasNews: hasNews ?? false },
      })
      return { success: true, state }
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

/**
 * Streams the reply text as it's generated (via onDelta) instead of waiting for
 * the whole response — this is what lets the client start speaking the first
 * sentence while Claude is still writing the rest, instead of the old
 * chat-then-speak pipeline where the ENTIRE reply (sometimes after a tool-call
 * round trip) had to finish generating before a single word of audio started.
 * That non-streamed round trip was the single biggest source of the "muy
 * lento" complaint — ElevenLabs' own streaming was already fast.
 *
 * Tool-use iterations still run non-streamed (a tool call needs its complete
 * JSON input before it can execute), but any iteration is free to emit
 * spoken text before or instead of calling a tool, so most turns — the ones
 * with no tool calls at all — get the full benefit.
 */
export async function chatWithJarvis(
  userId: string,
  history: JarvisMessage[],
  onDelta: (text: string) => void
): Promise<{ reply: string; history: JarvisMessage[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const reply = 'Mi conexión con Anthropic no está configurada (falta ANTHROPIC_API_KEY).'
    onDelta(reply)
    return { reply, history }
  }

  const client = new Anthropic({ apiKey })
  let messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }))

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const stream = client.messages.stream({
        model: JARVIS_MODEL,
        // Capped down from 800 — Jarvis's replies are meant to be a few short
        // spoken sentences (per the system prompt); 800 tokens was enough
        // headroom for the model to occasionally ramble, which is pure added
        // latency for a voice UI. This is a safety ceiling, not the target length.
        max_tokens: 350,
        system: JARVIS_SYSTEM_PROMPT,
        tools,
        messages,
      })
      stream.on('text', (delta) => onDelta(delta))
      const response = await stream.finalMessage()

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
      if (!text) onDelta('No tengo una respuesta para eso.')
      return { reply: text || 'No tengo una respuesta para eso.', history: newHistory }
    }

    const reply = 'Necesité demasiados pasos para responder eso — intenta preguntar algo más específico.'
    onDelta(reply)
    return { reply, history }
  } catch (err) {
    const status = err instanceof APIError ? err.status : null
    const reply =
      status === 429
        ? 'Estoy saturado de solicitudes ahora mismo. Intenta en unos segundos.'
        : 'Tuve un problema procesando eso. Intenta de nuevo.'
    if (status !== 429) console.error('[jarvis] error', err)
    onDelta(reply)
    return { reply, history }
  }
}
