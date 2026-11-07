// Banco de temas del blog de Reports Systems, tal como lo definió el dueño (11 categorías).
// kind: 'general' | 'legal' (explicar lo general y recomendar confirmar con abogado/autoridad) | 'needs_input'
// (necesita datos reales del dueño: casos, testimonios o novedades; Luis no lo escribe solo).

export type BlogTopicKind = 'general' | 'legal' | 'needs_input'
export interface BlogTopicSeed { category: string; title: string; kind: BlogTopicKind; priority: number }

const CATEGORIES: [string, string[]][] = [
  ['Cierre de caja y control diario', [
    'Cómo cuadrar la caja al cerrar el turno', 'Qué es el over/short y cómo calcularlo', 'Por qué la caja sale corta o sobrante: 10 causas comunes',
    'Cómo contar billetes y monedas sin errores', 'Apertura de caja: qué dejar y qué revisar', 'Cómo pasar el turno de mañana al de tarde sin perder el control',
    'Qué es un cortecito y cuándo usarlo', 'Cómo hacer un arqueo sorpresa', 'Checklist de cierre de turno para cajeros']],
  ['Cheques', [
    'Cómo cobrar cheques sin riesgo en una tienda', 'Cómo detectar un cheque falso o alterado', 'Qué hacer con un cheque devuelto, paso a paso',
    'Cómo recuperar el dinero de un cheque devuelto', 'Cuánto cobrar de comisión por cambiar cheques', 'Cheques de nómina: qué verificar antes de pagarlos',
    'Cómo llevar un registro de cheques y de clientes de riesgo', 'Cómo identificar a un cliente reincidente con cheques devueltos',
    'Cómo preparar el cobro de lo que debe una compañía por cheques']],
  ['Envíos de dinero y servicios', [
    'Cómo controlar las comisiones de los envíos de dinero', 'Cancelaciones de envíos: cómo registrarlas y por qué se pierde dinero',
    'Reemplazos de envíos: cómo hacerlos sin dejar casos abiertos', 'Qué son los money orders y cómo controlarlos',
    'Cómo conciliar tus ventas con el reporte de cada compañía', 'Cómo cobrar pagos de servicios (agua, luz, teléfono) y llevar su registro',
    'Pagos con tarjeta de servicios: cómo cobrar tu comisión', 'Pesos mexicanos y cambio de moneda: cómo llevar el registro',
    'Paquetería, placas, notario e impuestos: cómo controlar servicios extra', 'Vuelos, seguros y trámites: cómo registrar lo que vendes y tu ganancia']],
  ['Depósitos y manejo del efectivo', [
    'Cómo hacer depósitos bancarios sin perder el rastro', 'Para qué sirve un SmartSafe y cómo controlarlo', 'Cuánto efectivo dejar en caja y cuánto sacar',
    'Cómo evitar robos y faltantes de efectivo', 'Evidencia de cada depósito: por qué guardar la foto', 'Cómo cuadrar los depósitos contra el banco']],
  ['Comisiones y ganancias', [
    'Cuánto gana realmente tu tienda por cada servicio', 'Cómo calcular la comisión de cada empleado', 'Cómo pagar comisiones a empleados sin discusiones',
    'Qué reporte revisar cada semana para saber si ganas', 'Cómo comparar un mes con otro', 'Cómo saber qué servicio te deja más dinero', 'Cuánto deberías cobrar por cada servicio']],
  ['Empleados y control interno', [
    'Cómo saber quién hizo qué en tu tienda', 'Cómo dar permisos a cada empleado', 'Qué hacer cuando faltan cuentas y no sabes quién fue',
    'Cómo prevenir el fraude interno', 'Cómo capacitar a un cajero nuevo en pocos días', 'Cómo evaluar el rendimiento de tus cajeros',
    'Cómo dejar de depender de WhatsApp para reportar el día']],
  ['Varias tiendas', [
    'Cómo manejar varias tiendas sin estar en todas', 'Cómo comparar el rendimiento entre sucursales', 'Cómo estandarizar el cierre en todas las tiendas',
    'Cuándo es momento de abrir la segunda tienda', 'Cómo controlar a los gerentes a distancia', 'Qué números mirar cada mañana si tienes varias tiendas']],
  ['Cumplimiento y permisos', [
    'Qué permisos y licencias necesita una tienda multiservicio', 'Cómo no dejar vencer un permiso', 'Cómo organizar los documentos legales de tu tienda',
    'Qué es el cumplimiento (compliance) en envíos de dinero, en lenguaje simple', 'Cómo prepararte para una auditoría o inspección',
    'Registros que debes guardar y por cuánto tiempo']],
  ['Del Excel al sistema', [
    'Por qué el Excel se queda corto para una tienda multiservicio', 'Qué debe tener un buen sistema para tiendas multiservicio',
    'Cómo pasar tus datos de Excel a un sistema sin perder nada', 'Cuánto cuesta no tener un sistema (cuentas y errores)', 'Cómo elegir un software para tu tienda',
    'Cómo ahorrar horas en el cierre de mes', 'Cómo digitalizar tu tienda en una semana']],
  ['Clientes y crecimiento', [
    'Cómo tratar a clientes frecuentes y llevar su historial', 'Cómo manejar los fiados sin perder dinero', 'Cómo vender más servicios en tu tienda',
    'Cómo hacer que un cliente vuelva', 'Cómo promocionar tu tienda en WhatsApp, Facebook e Instagram', 'Cómo aparecer en Google Maps con tu negocio']],
  ['Contenido de marca, útil para redes', [
    'Un día en una tienda ordenada, en contraste con una desordenada', 'Los 6 errores más caros de una tienda multiservicio', 'Preguntas frecuentes de los dueños de tienda',
    'Qué cambió en una tienda al llevar el control en un sistema', 'Novedades de Reports Systems']],
]

// Los 8 que el dueño recomendó escribir primero, en ese orden.
const FIRST = [
  'Cómo cuadrar la caja al cerrar el turno', 'Qué hacer con un cheque devuelto, paso a paso', 'Cómo controlar las comisiones de los envíos de dinero',
  'Por qué la caja sale corta o sobrante: 10 causas comunes', 'Cómo saber quién hizo qué en tu tienda', 'Qué permisos y licencias necesita una tienda multiservicio',
  'Por qué el Excel se queda corto para una tienda multiservicio', 'Cómo manejar varias tiendas sin estar en todas',
]

// Temas que dependen de la ley del estado o de la licencia: se explica lo general y se recomienda confirmar con un abogado o la autoridad.
const LEGAL = /cheque devuelto|recuperar el dinero|cobrar de comisión|cobro de lo que debe|moneda|notario|impuestos|seguros|permiso|licencia|auditor|inspecci|registros que debes|cumplimiento|pagar comisiones a empleados|documentos legales|fraude interno/i
// Necesitan datos reales (casos, testimonios o novedades del producto): solo se escriben si el dueño aporta los hechos.
const NEEDS_INPUT = /^(Un día en una tienda ordenada|Qué cambió en una tienda|Novedades de Reports Systems)/i

export const BLOG_TOPICS: BlogTopicSeed[] = CATEGORIES.flatMap(([category, titles], ci) =>
  titles.map((title, i) => {
    const first = FIRST.indexOf(title)
    return {
      category,
      title,
      kind: NEEDS_INPUT.test(title) ? 'needs_input' : category === 'Cumplimiento y permisos' || LEGAL.test(title) ? 'legal' : 'general',
      priority: first >= 0 ? first + 1 : 100 + ci * 20 + i,
    } as BlogTopicSeed
  }),
)

export const LEGAL_NOTE_ES = 'Las reglas cambian según el estado y el tipo de licencia. Confirma siempre con un abogado o con la autoridad de tu estado antes de tomar decisiones; este artículo explica lo general y no sustituye esa consulta.'
export const LEGAL_NOTE_EN = 'Rules change by state and license type. Always confirm with an attorney or your state authority before making decisions; this article covers the general picture and does not replace that advice.'
