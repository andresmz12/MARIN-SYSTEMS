// Redes a las que el sistema publica imágenes automáticamente. Los videos los sube
// el dueño a mano (TikTok incluido), así que no están aquí.
export const AUTO_PLATFORMS = ['instagram', 'facebook', 'linkedin', 'twitter'] as const
export type AutoPlatform = (typeof AUTO_PLATFORMS)[number]

export function isAutoPlatform(p: string): p is AutoPlatform {
  return (AUTO_PLATFORMS as readonly string[]).includes(p)
}

/** X/Twitter: el texto publicado (copy + hashtags) no puede pasar de 280 caracteres. */
export const TWEET_MAX = 280

/** Recorta el copy para que copy + hashtags quepa en X (280). En otras redes lo deja igual. */
export function fitCopy(platform: string, copy: string, hashtags: string[]): string {
  if (platform !== 'twitter') return copy
  const tags = hashtags.slice(0, 2).join(' ')
  const suffixLen = tags ? tags.length + 2 : 0
  const room = TWEET_MAX - suffixLen
  if (copy.length <= room) return copy
  // Cortar en el último límite de frase que quepa; si no hay, en la última palabra + "…".
  const cut = copy.slice(0, room - 1)
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'))
  if (sentenceEnd > room * 0.5) return cut.slice(0, sentenceEnd + 1).trimEnd()
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Texto final que se publica en una red: copy + hashtags (X: máximo 2 y siempre ≤ 280). */
export function composePostText(platform: string, copy: string, hashtags: string[]): string {
  const body = fitCopy(platform, copy, hashtags)
  const tags = (platform === 'twitter' ? hashtags.slice(0, 2) : hashtags).join(' ')
  return tags ? `${body}\n\n${tags}` : body
}

/** ¿El copy generado ya cabe en la red sin recortar? (solo X tiene límite estricto) */
export function fitsPlatform(platform: string, copy: string, hashtags: string[]): boolean {
  return fitCopy(platform, copy, hashtags) === copy
}
