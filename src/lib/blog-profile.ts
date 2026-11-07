// Perfil de Reports Systems tal como lo definió el dueño: sirve de valor inicial del formulario de Luis.
export const BLOG_PROFILE_DEFAULT = {
  name: 'Reports Systems',
  website: 'https://reportssystems.com',
  tone: 'Cercano, práctico y de tú. Poco técnico y nada de jerga de software.',
  audience: 'Dueños y gerentes de tiendas multiservicio hispanas en EE. UU.',
  topics: [
    'Cómo cuadrar la caja al cerrar el turno',
    'Qué hacer con un cheque devuelto',
    'Controlar las comisiones de los envíos',
    'Permisos y licencias al día',
    'Evitar faltantes en la caja',
    'Cancelaciones de envíos',
    'Manejar varias tiendas',
  ],
  rules: [
    'No inventes cifras, leyes ni clientes.',
    'Cada artículo termina con una sección práctica (qué hacer hoy, en pasos o lista de chequeo).',
    'No uses HTML.',
    'No pidas ni insertes datos de clientes reales.',
  ].join('\n'),
  cta: 'Pide una demo por WhatsApp: https://wa.me/13124989026',
} as const
