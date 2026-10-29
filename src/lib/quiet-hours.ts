// Horas de descanso: de 11 PM a 7 AM (hora de Colombia, UTC-5 fijo) la app no vigila ni envía avisos de monitoreo.
// Para vigilar también de noche: AGENT_MONITOR_QUIET=off en Railway.
export const QUIET_FROM_HOUR = 23
export const QUIET_TO_HOUR = 7

export function isQuietHours(now: Date = new Date()): boolean {
  if ((process.env.AGENT_MONITOR_QUIET ?? '').toLowerCase() === 'off') return false
  const hour = new Date(now.getTime() - 5 * 60 * 60 * 1000).getUTCHours()
  return hour >= QUIET_FROM_HOUR || hour < QUIET_TO_HOUR
}
