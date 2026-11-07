// Cliente de la API del blog de Reports Systems (docs: POST/GET /api/blog/posts con una clave rsb_...).
// La clave va en Railway como BLOG_API_KEY (de preferencia una de "solo borradores"); la dirección, en BLOG_API_URL.

export const blogConfigured = () => !!process.env.BLOG_API_KEY
const base = () => (process.env.BLOG_API_URL || 'https://reportssystems.com').replace(/\/$/, '')

export interface BlogPostInput {
  title: string
  description: string
  content: string
  locale: 'es' | 'en'
  slug?: string
  tags?: string[]
  translationKey?: string
  coverImageUrl?: string
  coverImageAlt?: string
}
export interface BlogPostCreated { id: string; locale: string; slug: string; title: string; status: string; url: string }
export interface BlogPostListed { title: string; slug: string; locale: string; status?: string }

export class BlogApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  const key = process.env.BLOG_API_KEY
  if (!key) throw new BlogApiError('Falta la clave BLOG_API_KEY en Railway.', 400, 'no_key')
  let res: Response
  try {
    res = await fetch(`${base()}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(30_000) })
  } catch {
    throw new BlogApiError('No se pudo conectar con el blog de Reports Systems.', 504, 'network')
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown }
  if (res.ok) return body
  const code = typeof body.error === 'string' ? body.error : undefined
  const msg =
    res.status === 401 ? 'La clave del blog (BLOG_API_KEY) es incorrecta o fue revocada.'
    : res.status === 403 ? 'Esa clave no puede publicar: el blog solo acepta borradores con ella.'
    : res.status === 409 ? 'Ese slug ya existe en el blog.'
    : res.status === 429 ? 'El blog limitó las peticiones (60 por hora). Espera un rato.'
    : res.status === 400 ? `El blog rechazó el artículo: ${JSON.stringify(body.details ?? body.error ?? '').slice(0, 300)}`
    : `El blog respondió ${res.status}.`
  throw new BlogApiError(msg, res.status, code)
}

/** Artículos que ya existen (de cualquier estado) para no repetir temas. */
export async function listBlogPosts(locale: 'es' | 'en'): Promise<BlogPostListed[]> {
  const body = (await call(`/api/blog/posts?locale=${locale}`, { method: 'GET' })) as { posts?: BlogPostListed[]; data?: BlogPostListed[] } | BlogPostListed[]
  const arr = Array.isArray(body) ? body : (body.posts ?? body.data ?? [])
  return arr.filter((p) => p && typeof p.title === 'string')
}

/** Envía un artículo SIEMPRE como borrador: nunca se manda status "published". */
export async function createBlogDraft(input: BlogPostInput): Promise<BlogPostCreated> {
  const payload: Record<string, unknown> = { ...input, status: 'draft' }
  for (const k of Object.keys(payload)) if (payload[k] === undefined || payload[k] === '') delete payload[k]
  return (await call('/api/blog/posts', { method: 'POST', body: JSON.stringify(payload) })) as BlogPostCreated
}
