export const PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
  'AUD/USD', 'NZD/USD', 'USD/CAD', 'GBP/JPY',
  'EUR/JPY', 'XAU/USD',
]

export const SETUPS = [
  'London Breakout', 'NY Session Open', 'Estructura H4',
  'Rebote soporte/resistencia', 'Fibonacci', 'Price Action', 'Otro',
]

export const EMOTIONS = [
  'Tranquilo', 'Ansioso', 'Confiado', 'Dudoso',
  'Emocionado', 'Frustrado', 'Neutral',
]

export const RESULTS = ['win', 'loss', 'be'] as const
export type TradeResult = (typeof RESULTS)[number]

export const EVENT_TYPES = ['personal', 'trading', 'aprendizaje', 'otro'] as const

export const INDUSTRIES = [
  'Consultoría', 'SaaS/Tech', 'Limpieza', 'Logística/Envíos',
  'Inmobiliaria', 'E-commerce', 'Otro',
]

export const COMPANY_STATUSES = ['activa', 'pausa', 'idea'] as const

export const HABIT_CATEGORIES = ['trading', 'salud', 'personal', 'aprendizaje'] as const
export const HABIT_FREQUENCIES = ['diario', 'semanal'] as const

export const LINK_TYPES = ['Google Drive', 'Notion', 'GitHub', 'Figma', 'Web', 'Otro'] as const

export const TASK_PRIORITIES = ['alta', 'media', 'baja'] as const
export const TASK_STATUSES = ['pendiente', 'en-progreso', 'completada'] as const
