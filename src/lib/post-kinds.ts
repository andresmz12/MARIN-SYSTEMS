// Tipos de contenido para que la semana no sea siempre lo mismo: educativo, pregunta frecuente, servicio y noticia.
export type PostKind = 'educativo' | 'pregunta' | 'servicio' | 'noticia'

export const KIND_LABEL: Record<PostKind, string> = {
  educativo: '📚 Educativo',
  pregunta: '❓ Pregunta frecuente',
  servicio: '🤝 Cómo te ayudamos',
  noticia: '📰 Noticia',
}

const GUIDE: Record<PostKind, string> = {
  educativo: 'Explica UNA regla o beneficio fiscal a fondo: qué es, quién califica, quién NO, cómo se usa y hasta cuándo. Cierra invitando a guardar el post.',
  pregunta: 'Responde una pregunta frecuente de un dueño de negocio latino. Formato: la pregunta clara como gancho ("¿Necesito…?") y la respuesta directa en pasos cortos. Sin casos de clientes inventados.',
  servicio: 'Muestra cómo ayudamos con UN trámite concreto (por ejemplo abrir una LLC, obtener un ITIN o preparar los impuestos de un negocio): qué documentos se necesitan, cómo es el proceso y cómo empezar. Sin precios inventados, sin promesas, sin testimonios ni clientes inventados; invita a escribirnos.',
  noticia: 'Explica la noticia y qué cambia para dueños de negocio y trabajadores independientes latinos.',
}
export const kindGuide = (k: PostKind) => `TIPO DE POST: ${KIND_LABEL[k]}. ${GUIDE[k]}`

const ROTATION: PostKind[] = ['educativo', 'pregunta', 'servicio']

/** Elige los tipos de los próximos `n` posts: primero los que menos han salido en los últimos posts. */
export function pickKinds(recent: (string | null | undefined)[], n: number): PostKind[] {
  const count = (k: PostKind) => recent.filter((r) => r === k).length
  const pool = [...ROTATION]
  const out: PostKind[] = []
  while (out.length < n) {
    const sorted = [...pool].sort((a, b) => count(a) + out.filter((x) => x === a).length - (count(b) + out.filter((x) => x === b).length) || ROTATION.indexOf(a) - ROTATION.indexOf(b))
    out.push(sorted[0])
  }
  return out
}

export function mixOf(kinds: (string | null | undefined)[]): { kind: PostKind; count: number }[] {
  return (Object.keys(KIND_LABEL) as PostKind[]).map((k) => ({ kind: k, count: kinds.filter((x) => x === k).length }))
}
