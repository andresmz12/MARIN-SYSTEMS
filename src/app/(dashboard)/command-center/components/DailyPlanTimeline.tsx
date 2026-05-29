'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { DailyPlan, WorkBlock } from '../types'
import { BLOCK_TYPE_CONFIG, BLOCK_STATUS_CONFIG } from '../utils'

interface Props {
  plan: DailyPlan | null
  loading: boolean
  generating: boolean
  onGenerate: () => void
  onBlockUpdate: (id: string, status: string) => void
}

export function DailyPlanTimeline({ plan, loading, generating, onGenerate, onBlockUpdate }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800/60 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!plan || plan.workBlocks.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center">
        <div className="text-4xl mb-3">🗓️</div>
        <h3 className="text-lg font-bold text-white">Aún no hay plan para este día</h3>
        <p className="mt-1.5 text-sm text-zinc-500 max-w-sm mx-auto">
          El sistema distribuirá tu tiempo entre tus empresas automáticamente según prioridad estratégica,
          ideas activas y trabajo acumulado.
        </p>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="mt-5 px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
        >
          {generating ? 'Generando…' : '⚡ Generar plan para hoy'}
        </button>
      </div>
    )
  }

  const blocks = plan.workBlocks
  const totalHours = blocks.reduce((s, b) => s + b.durationHours, 0)
  const doneBlocks = blocks.filter((b) => b.status === 'done')
  const workedHours = doneBlocks.reduce((s, b) => s + b.durationHours, 0)

  return (
    <div>
      <div className="space-y-2.5">
        {blocks.map((block) => (
          <TimelineBlock key={block.id} block={block} onBlockUpdate={onBlockUpdate} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
        <span className="text-zinc-300 font-medium">
          {doneBlocks.length} de {blocks.length} bloques completados
        </span>
        <span className="text-zinc-500">
          {workedHours}h de {totalHours}h trabajadas
        </span>
      </div>
    </div>
  )
}

function TimelineBlock({ block, onBlockUpdate }: { block: WorkBlock; onBlockUpdate: (id: string, status: string) => void }) {
  const typeCfg = BLOCK_TYPE_CONFIG[block.blockType] ?? BLOCK_TYPE_CONFIG.work
  const statusCfg = BLOCK_STATUS_CONFIG[block.status] ?? BLOCK_STATUS_CONFIG.pending
  const color = block.company?.color ?? '#6366f1'
  const done = block.status === 'done'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-stretch gap-3 rounded-xl border bg-zinc-900 overflow-hidden transition-colors ${
        done ? 'border-green-500/30' : 'border-zinc-800'
      }`}
    >
      {/* Company color strip */}
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: color }} />

      <div className="flex-1 py-3 pr-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-zinc-500">
            {block.startTime}–{block.endTime}
          </span>
          <span className="text-xs text-zinc-400">
            {block.company?.emoji ?? '📈'} {block.company?.name ?? 'Forex'}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeCfg.cls}`}>{typeCfg.label}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusCfg.cls}`}>{statusCfg.label}</span>
          {block.rolledFromDate && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400/80 border-amber-500/30">
              ↩ acumulado
            </span>
          )}
        </div>

        <p className={`mt-1 text-sm font-medium ${done ? 'text-zinc-500 line-through' : 'text-white'}`}>
          {block.title}
        </p>
        {block.description && <p className="mt-0.5 text-xs text-zinc-500">{block.description}</p>}

        {/* Actions */}
        <div className="mt-2 flex items-center gap-1.5">
          <AnimatePresence mode="wait">
            {done ? (
              <motion.span
                key="check"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-1 text-xs text-green-400 font-medium"
              >
                ✅ Completado
              </motion.span>
            ) : (
              <motion.div key="actions" className="flex items-center gap-1.5">
                <button
                  onClick={() => onBlockUpdate(block.id, 'done')}
                  className="text-xs px-2 py-1 rounded-md bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
                >
                  ✅ Hecho
                </button>
                <button
                  onClick={() => onBlockUpdate(block.id, 'skipped')}
                  className="text-xs px-2 py-1 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                >
                  ⏭️ Saltar
                </button>
                <button
                  onClick={() => onBlockUpdate(block.id, 'rolled_over')}
                  className="text-xs px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                >
                  🔄 Acumular
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
