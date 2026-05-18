'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  isOpen: boolean
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.25 }}
            className="bg-[#111] border border-[#2a2a2a] rounded-2xl w-full max-w-sm p-5 space-y-4"
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">{title}</h3>
              <p className="text-sm text-gray-400">{message}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={onCancel} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  danger
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
