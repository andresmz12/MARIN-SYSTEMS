import { z } from 'zod'
import { RESULTS, EVENT_TYPES, TASK_PRIORITIES, TASK_STATUSES, HABIT_CATEGORIES, HABIT_FREQUENCIES, COMPANY_STATUSES } from './constants'

export const TradeSchema = z.object({
  pair: z.string().min(1, 'Par requerido').max(20),
  result: z.enum(RESULTS),
  pips: z.number().nullable().optional(),
  setup: z.string().max(100).nullable().optional(),
  emotion: z.string().max(50).nullable().optional(),
  followedPlan: z.boolean().optional().default(false),
  notes: z.string().max(2000).nullable().optional(),
  date: z.string().optional(),
})

export const HabitSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  emoji: z.string().min(1, 'Emoji requerido').max(10),
  category: z.enum(HABIT_CATEGORIES),
  frequency: z.enum(HABIT_FREQUENCIES),
  isPreMarket: z.boolean().optional().default(false),
})

export const CompanySchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100),
  description: z.string().max(500).nullable().optional(),
  emoji: z.string().max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido').optional(),
  status: z.enum(COMPANY_STATUSES).optional(),
  industry: z.string().max(100).nullable().optional(),
})

export const EventSchema = z.object({
  title: z.string().min(1, 'Título requerido').max(200),
  date: z.string().min(1, 'Fecha requerida'),
  time: z.string().nullable().optional(),
  type: z.enum(EVENT_TYPES),
  notes: z.string().max(1000).nullable().optional(),
  isForexNews: z.boolean().optional().default(false),
  forexPair: z.string().max(20).nullable().optional(),
})

export const JournalSchema = z.object({
  date: z.string().min(1, 'Fecha requerida'),
  mood: z.coerce.number().int().min(1, 'Mínimo 1').max(5, 'Máximo 5'),
  content: z.string().min(1, 'Contenido requerido').max(5000),
  tags: z.array(z.string().max(50)).optional().default([]),
})

export const TaskSchema = z.object({
  title: z.string().min(1, 'Título requerido').max(200),
  description: z.string().max(1000).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional().default('media'),
  status: z.enum(TASK_STATUSES).optional().default('pendiente'),
  dueDate: z.string().nullable().optional(),
})

export const TaskUpdateSchema = TaskSchema.partial().extend({
  title: z.string().min(1).max(200).optional(),
})
