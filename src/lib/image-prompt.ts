// Prompt de imagen listo para pegar en ChatGPT (o cualquier generador). Lo arma el
// sistema con una plantilla fija — no la IA — para que cada pieza salga con la misma
// estructura: medidas de la red, estilo de la marca, texto EXACTO en español y márgenes.
// Es puro (sin acceso a la base de datos) para usarlo igual en servidor y en pantalla.

export interface ImageText {
  headline: string
  subheadline?: string
  /** Dato destacado en grande: el monto, la fecha o el formulario (ej: "$2,000 · 15 de abril"). */
  keyFact?: string
  bullets?: string[]
  /** Línea de acción al pie (ej: "Agenda tu cita"). */
  cta?: string
  /** true = sale la cara de la marca (la persona de la foto de referencia); false = infografía sin personas. */
  face?: boolean
}

export interface VisualStyle {
  palette?: string[] // colores hex de la marca
  style?: string // estilo visual en palabras
  handle?: string // @usuario y/o web, va en el pie de la imagen
  avoid?: string // cosas que nunca deben aparecer
}

interface ImageSpec {
  label: string
  /** Tamaño final exacto de la red. */
  width: number
  height: number
  ratio: string
  /** Formato nativo más cercano que suelen ofrecer los generadores (ChatGPT: cuadrada, vertical 2:3, horizontal 3:2). */
  canvas: string
  /** Zona central donde debe vivir TODO el texto, para sobrevivir al recorte final. */
  safe: string
  note: string
}

export const IMAGE_SPECS: Record<string, ImageSpec> = {
  instagram: { label: 'Instagram', width: 1080, height: 1350, ratio: '4:5', canvas: 'portrait (2:3)', safe: 'the central 78% of the height', note: 'vertical feed post' },
  facebook: { label: 'Facebook', width: 1080, height: 1080, ratio: '1:1', canvas: 'square (1:1)', safe: 'the central 85% in both directions', note: 'square post with a friendly, conversational feel' },
  linkedin: { label: 'LinkedIn', width: 1200, height: 628, ratio: '1.91:1', canvas: 'landscape (3:2)', safe: 'the central 72% of the height', note: 'horizontal, sober and professional, informative look' },
  twitter: { label: 'X (Twitter)', width: 1600, height: 900, ratio: '16:9', canvas: 'landscape (3:2)', safe: 'the central 78% of the height', note: 'horizontal; the headline must be readable at thumbnail size' },
  tiktok: { label: 'TikTok', width: 1080, height: 1920, ratio: '9:16', canvas: 'portrait (2:3)', safe: 'the central 78% of the width and between 15% and 75% of the height (the app interface covers the top and bottom)', note: 'vertical' },
}

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Lectura tolerante del JSON guardado (puede venir de la IA o de una edición manual). */
export function parseImageText(raw: unknown): ImageText | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const headline = clean(o.headline)
  if (!headline) return null
  const subheadline = clean(o.subheadline)
  const bullets = Array.isArray(o.bullets) ? o.bullets.map(clean).filter(Boolean).slice(0, 5) : []
  const keyFact = clean(o.keyFact)
  const cta = clean(o.cta)
  return {
    headline,
    ...(subheadline ? { subheadline } : {}),
    ...(keyFact ? { keyFact } : {}),
    ...(bullets.length ? { bullets } : {}),
    ...(cta ? { cta } : {}),
    ...(typeof o.face === 'boolean' ? { face: o.face } : {}),
  }
}

export function parseVisualStyle(raw: unknown): VisualStyle {
  if (typeof raw !== 'object' || raw === null) return {}
  const o = raw as Record<string, unknown>
  const palette = Array.isArray(o.palette)
    ? o.palette.map(clean).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 5)
    : []
  return {
    ...(palette.length ? { palette } : {}),
    ...(clean(o.style) ? { style: clean(o.style) } : {}),
    ...(clean(o.handle) ? { handle: clean(o.handle) } : {}),
    ...(clean(o.avoid) ? { avoid: clean(o.avoid) } : {}),
  }
}

const q = (s: string) => `"${s.replace(/"/g, '”')}"`

export function buildImagePrompt(input: {
  platform: string
  brandName: string
  /** Descripción de la escena (en inglés), sin texto ni colores: lo escribe la IA con el post. */
  scene?: string | null
  text?: ImageText | null
  style?: VisualStyle
}): string {
  const spec = IMAGE_SPECS[input.platform] ?? IMAGE_SPECS.instagram
  const style = input.style ?? {}
  const lines: string[] = []

  lines.push(
    `Create a finished, ready-to-post social media image for the brand ${q(input.brandName)}, for ${spec.label}.`,
    `FORMAT: use a ${spec.canvas} canvas. It will be center-cropped afterwards to ${spec.width}x${spec.height} px (${spec.ratio}), so keep ALL text and key elements inside ${spec.safe}; let only background extend beyond it.`,
    '',
    `VISUAL STYLE: ${style.style || 'clean, modern and professional'}.`,
    `COLOR PALETTE: ${style.palette?.length ? style.palette.join(', ') : 'a cohesive palette of 2-3 colors'}; strong contrast between text and background.`,
    input.text?.face
      ? `SCENE / COMPOSITION: Feature OUR BRAND SPOKESWOMAN — the woman in the reference photo attached to this message. Keep her face, skin tone, hair and features IDENTICAL to the photo; never invent a different person. ${input.scene?.trim() || 'She looks confident and approachable, in a modern office.'} She takes up about 40% of the frame on one side, leaving the other side clean for the information.`
      : `SCENE / COMPOSITION: Information-first graphic with NO people or faces. ${input.scene?.trim() || 'Abstract, minimal composition related to the topic'}. Use clear line icons and shapes.`,
    '',
  )

  const t = input.text
  if (t) {
    lines.push(
      'TEXT TO WRITE ON THE IMAGE — copy it EXACTLY, character by character, in Spanish. Keep every accent (á é í ó ú ñ ü) and the ¿ ¡ marks. Do not translate, rephrase, add or remove any word, and write no other text anywhere in the image:',
      `• Headline (largest, bold): ${q(t.headline)}`,
    )
    if (t.subheadline) lines.push(`• Subheadline: ${q(t.subheadline)}`)
    if (t.keyFact) lines.push(`• KEY FACT (second largest, inside a glowing badge or highlighted box): ${q(t.keyFact)}`)
    if (t.bullets?.length) lines.push(`• Info cards (${t.bullets.length}, one short line each, each with its own simple line icon): ${t.bullets.map(q).join(' / ')}`)
    if (t.cta) lines.push(`• Call to action (in a button-style bar near the bottom): ${q(t.cta)}`)
    if (style.handle) lines.push(`• Footer (small): ${q(style.handle)}`)
  } else {
    lines.push('Do not include any text in the image.')
  }

  lines.push(
    '',
    `LAYOUT (top to bottom): headline → subheadline → key fact badge → info cards → call to action → footer. Rich in information but organized: a clear visual hierarchy, aligned cards with equal spacing, bold modern sans-serif typography, easy to read on a phone, generous margins (at least 6% on every side); ${spec.note}.`,
    `AVOID: watermarks, fake logos, gibberish or misspelled text, extra words${style.avoid ? `, ${style.avoid}` : ''}.`,
    'Output a single finished image.',
  )
  return lines.join('\n')
}

/** Proporción objetivo (ancho/alto) de la red. */
export function targetRatio(platform: string): number {
  const s = IMAGE_SPECS[platform]
  return s ? s.width / s.height : 1
}

/** Máximo de imagen que se acepta recortar para ajustarla a la red (el resto del texto vive en la zona segura). */
export const MAX_CROP_LOSS = 0.3
const RATIO_TOLERANCE = 0.02

export type FitPlan =
  | { action: 'keep' } // ya tiene la proporción de la red
  | { action: 'crop'; loss: number } // se recorta al centro al tamaño exacto de la red
  | { action: 'mismatch'; loss: number } // habría que recortar demasiado: se deja tal cual y se avisa

/** Decide qué hacer con una imagen subida según la proporción de la red. */
export function planFit(platform: string, width: number, height: number): FitPlan {
  if (!IMAGE_SPECS[platform] || !width || !height) return { action: 'keep' }
  const target = targetRatio(platform)
  const actual = width / height
  if (Math.abs(actual - target) / target <= RATIO_TOLERANCE) return { action: 'keep' }
  // Fracción del área que se pierde al recortar al centro hasta la proporción objetivo.
  const loss = actual > target ? 1 - target / actual : 1 - actual / target
  return loss <= MAX_CROP_LOSS ? { action: 'crop', loss } : { action: 'mismatch', loss }
}

/**
 * Un post que comparte contenido entre varias redes (groupId) usa UNA sola imagen 4:5:
 * Instagram, Facebook, LinkedIn y X la aceptan sin recortes raros. Un post suelto usa el formato de su red.
 */
export const GROUP_IMAGE_PLATFORM = 'instagram'
export function imagePlatformOf(post: { platform: string; groupId?: string | null }): string {
  return post.groupId ? GROUP_IMAGE_PLATFORM : post.platform
}
