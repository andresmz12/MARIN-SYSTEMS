import type { ImageText } from './image-prompt'

export interface ComplianceIssue {
  level: 'error' | 'warn'
  where: 'texto' | 'imagen'
  message: string
}

const money = (s: string): number[] =>
  Array.from(s.matchAll(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\.\d+)?\s*(millones|millón|M\b|mil\b)?/gi)).map((m) => {
    const n = Number(m[1].replace(/[.,](?=\d{3}\b)/g, ''))
    const unit = (m[2] ?? '').toLowerCase()
    return unit.startsWith('mill') || unit === 'm' ? n * 1_000_000 : unit === 'mil' ? n * 1000 : n
  })

const PROMISES: [RegExp, string][] = [
  [/\b(garantiz\w*|garant[ií]a|sin riesgo|100\s?% seguro|te devolver[eé]mos|nunca pagar[aá]s)\b/i, 'promete o garantiza un resultado'],
  [/\b(ahorrar[aá]s|reducir[aá]s|pagar[aá]s menos|recuperar[aá]s)\b/i, 'afirma un ahorro como seguro (usa "puede ayudarte a…")'],
  [/\b(reduce|reducen|elimina|eliminan)\s+(tus|los)\s+impuestos\b/i, '"reduce tus impuestos" suena a promesa (usa "puede ayudarte a pagar menos")'],
  [/\b(gratis|sin costo)\b/i, 'dice "gratis" o "sin costo"'],
  [/\b(maximiz\w+|el truco|el secreto)\b/i, 'suena a truco o a promesa ("maximizar", "el truco"): usa un lenguaje más neutral'],
]
const FORBIDDEN_VOCAB = /\b(asesor[ií]a fiscal|hacienda|fisco|declaraci[oó]n de la renta)\b/i
const CONDITION = /\b(solo|s[oó]lo|si |siempre que|depende|requisito|condici[oó]n|tope|l[ií]mite|antes del|no califica|ganancias? de tu negocio|hasta)\b/i
const ASSUMPTION = /\b(tasa|suponiendo|asumiendo|supone|con un ingreso|si tu|si pagas|aproximad)/i

/** Revisión automática (sin IA) de promesas, ejemplos sin suposición, topes de empresas grandes y avisos faltantes. */
export function lintPost(input: { copy: string; imageText?: ImageText | null }): ComplianceIssue[] {
  const out: ComplianceIssue[] = []
  const t = input.imageText
  const imgText = t ? [t.headline, t.subheadline, t.keyFact, ...(t.bullets ?? []), t.cta].filter(Boolean).join(' · ') : ''

  for (const [where, text] of [['texto', input.copy], ['imagen', imgText]] as const) {
    if (!text) continue
    for (const [re, msg] of PROMISES) if (re.test(text)) out.push({ level: 'error', where, message: msg })
    if (FORBIDDEN_VOCAB.test(text)) out.push({ level: 'error', where, message: 'usa un término que no queremos ("asesoría fiscal", "Hacienda", "fisco")' })
    if (/\bejemplo\b/i.test(text) && /\$\s?\d/.test(text) && !ASSUMPTION.test(text)) {
      out.push({ level: 'warn', where, message: 'el ejemplo con números no dice su suposición (tasa o ingreso)' })
    }
  }

  if (t) {
    const big = [t.headline, t.subheadline, t.keyFact].filter(Boolean).flatMap((x) => money(x as string)).some((n) => n >= 1_000_000)
    if (big) out.push({ level: 'error', where: 'imagen', message: 'destaca una cifra de millones (un tope para empresas grandes): explícala solo en el texto' })
    if (t.bullets?.length && !t.bullets.some((b) => CONDITION.test(b))) {
      out.push({ level: 'warn', where: 'imagen', message: 'ningún punto aclara la condición o quién no califica' })
    }
    if (/100\s?%/.test(imgText) && !CONDITION.test(imgText)) out.push({ level: 'warn', where: 'imagen', message: 'dice "100%" sin su condición' })
  }

  if (input.copy && !/(irs\.gov|profesional|contador)/i.test(input.copy)) {
    out.push({ level: 'warn', where: 'texto', message: 'falta el cierre "Cifras de referencia; confírmalas en IRS.gov o con un profesional"' })
  }
  return out
}
