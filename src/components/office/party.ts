// La fiesta de la oficina: después de que "cierra" todo, los agentes se van a la discoteca.
// Hora de Colombia, en minutos desde 00:00. De 11 PM a 3 AM hay fiesta; de 3 a 7 AM todos duermen.
export const PARTY_FROM = 23 * 60
export const PARTY_TO = 3 * 60
export const isPartyTime = (minutes: number) => minutes >= PARTY_FROM || minutes < PARTY_TO

/** Lo que dicen de vez en cuando mientras bailan (todo de mentiras y en broma). */
export const PARTY_LINES = [
  '🍹 ¡Otra ronda, DJ!',
  '🪩 ¡Que suene el reggaetón!',
  'Mi uptime: 100%. Mi hígado: 12%',
  'Shhh, que no se entere el CEO',
  '🥃 Un shot por cada error 500',
  '¡Yo no tomo… solo pruebo! 🍸',
  'Mañana tengo guayabo… digo, mantenimiento',
  '💃 ¡Dame caché, dame caché!',
  '¿Alguien vio mi último deploy?',
  '🍺 Salud por los 200 OK',
  'Que alguien le quite el micrófono a Jarvis',
  'Mis crons bailan mejor que yo',
]
export const DJ_LINES = ['🎧 DJ Cron en la casa', '🎶 Este remix va en producción', '🔊 ¡Súbele al volumen!']

/** Los pasados de copas (siempre en broma). */
export const TIPSY_LINES = [
  'Hip… ¿quién movió el piso? 🥴',
  'Yo manejo… digo, el cron',
  'Una más y me voy… (mentira)',
  '¿Dónde dejé mi vaso? 🍹',
  'Los quiero a todos, servidores incluidos 🥹',
  'Jajaja… ¿de qué nos reíamos?',
]
