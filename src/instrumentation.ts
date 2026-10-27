// Se ejecuta una vez al arrancar el servidor Node (no en el build).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAgentScheduler } = await import('@/lib/agent-scheduler')
    startAgentScheduler()
  }
}
