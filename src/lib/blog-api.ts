// Cliente de la API de los blogs (docs: POST/GET /api/blog/posts con una clave rsb_...). Un blog por empresa.
// La dirección del blog se guarda en el perfil de la empresa; la CLAVE (secreta) va en Railway como
// BLOG_API_KEY_<NOMBRE_DE_LA_EMPRESA> (ej: BLOG_API_KEY_MY_PROFIT_AND_LOSS). Reports Systems también acepta BLOG_API_KEY y BLOG_API_URL.

export interface BlogTarget { baseUrl: string; key: string; envVar: string }

export const blogEnvName = (companyName: string) =>
  `BLOG_API_KEY_${companyName.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`

const ISM_ALIAS = /\bism\b/i
const LEGACY_NAME = () => (process.env.BLOG_COMPANY_NAME || 'Reports Systems').toLowerCase()

/** Dirección y clave del blog de una empresa; null si todavía no está la clave en Railway. */
export function resolveBlogTarget(company: { name: string }, profile: { blogApiUrl?: string | null } | null): BlogTarget | null {
  const envVar = blogEnvName(company.name)
  const legacy = company.name.toLowerCase().includes(LEGACY_NAME())
  // La clave de MyProfit (el sistema de ISM) puede estar guardada con el nombre de la app: ISM también la acepta.
  const alias = ISM_ALIAS.test(company.name) ? process.env.BLOG_API_KEY_MY_PROFIT_AND_LOSS : undefined
  const key = process.env[envVar] || (legacy ? process.env.BLOG_API_KEY : undefined) || alias
  const url = profile?.blogApiUrl || (legacy ? process.env.BLOG_API_URL || 'https://reportssystems.com' : '')
  if (!key || !url) return null
  return { baseUrl: url.replace(/\/$/, ''), key, envVar }
}

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

async function call(target: BlogTarget, path: string, init: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${target.baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${target.key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) })
  } catch {
    throw new BlogApiError('No se pudo conectar con el blog.', 504, 'network')
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown }
  if (res.ok) return body
  const code = typeof body.error === 'string' ? body.error : undefined
  const msg =
    res.status === 401 ? `La clave del blog (${target.envVar}) es incorrecta o fue revocada.`
    : res.status === 403 ? 'Esa clave no puede publicar: el blog solo acepta borradores con ella.'
    : res.status === 409 ? 'Ese slug ya existe en el blog.'
    : res.status === 429 ? 'El blog limitó las peticiones (60 por hora). Espera un rato.'
    : res.status === 400 ? `El blog rechazó el artículo: ${JSON.stringify(body.details ?? body.error ?? '').slice(0, 300)}`
    : `El blog respondió ${res.status}.`
  throw new BlogApiError(msg, res.status, code)
}

/** Artículos que ya existen (de cualquier estado) para no repetir temas. */
export async function listBlogPosts(target: BlogTarget, locale: 'es' | 'en'): Promise<BlogPostListed[]> {
  const body = (await call(target, `/api/blog/posts?locale=${locale}`, { method: 'GET' })) as { posts?: BlogPostListed[]; data?: BlogPostListed[] } | BlogPostListed[]
  const arr = Array.isArray(body) ? body : (body.posts ?? body.data ?? [])
  return arr.filter((p) => p && typeof p.title === 'string')
}

/** Envía un artículo SIEMPRE como borrador: nunca se manda status "published". */
export async function createBlogDraft(target: BlogTarget, input: BlogPostInput): Promise<BlogPostCreated> {
  const payload: Record<string, unknown> = { ...input, status: 'draft' }
  for (const k of Object.keys(payload)) if (payload[k] === undefined || payload[k] === '') delete payload[k]
  const raw = (await call(target, '/api/blog/posts', { method: 'POST', body: JSON.stringify(payload) })) as Record<string, unknown> | null
  // Algunos blogs no devuelven todos los campos (por ejemplo `locale`): se completan con lo que se envió, para no fallar después de crear el borrador.
  const r = (raw && typeof raw.post === 'object' && raw.post ? raw.post : raw ?? {}) as Partial<BlogPostCreated>
  return {
    id: String(r.id ?? ''),
    locale: String(r.locale ?? input.locale),
    slug: String(r.slug ?? input.slug ?? ''),
    title: String(r.title ?? input.title),
    status: String(r.status ?? 'draft'),
    url: String(r.url ?? (raw as { permalink?: unknown } | null)?.permalink ?? ''),
  }
}

/** Envía el borrador reintentando con otro slug si ya existe (409). */
export async function createBlogDraftRetry(target: BlogTarget, input: BlogPostInput): Promise<BlogPostCreated> {
  const base = input.slug ?? ''
  for (let n = 1; n <= 3; n++) {
    try { return await createBlogDraft(target, { ...input, slug: base ? (n === 1 ? base : `${base}-${n}`) : undefined }) }
    catch (e) { if (!(e instanceof BlogApiError && e.status === 409) || n === 3) throw e }
  }
  throw new BlogApiError('No se pudo crear el borrador.', 500)
}
