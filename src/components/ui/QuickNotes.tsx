'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function QuickNotes() {
  const [isOpen, setIsOpen] = useState(false)
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load content when drawer opens
  useEffect(() => {
    if (!isOpen) return
    fetch('/api/quick-notes')
      .then((r) => r.json())
      .then((data) => {
        setContent(data.content ?? '')
        setTimeout(() => textareaRef.current?.focus(), 50)
      })
      .catch(() => {})
  }, [isOpen])

  const saveNote = useCallback((value: string) => {
    fetch('/api/quick-notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: value }),
    })
      .then((r) => {
        if (r.ok) {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        }
      })
      .catch(() => {})
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNote(value), 1000)
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-[#1a1a1a] border border-[#3a3a3a] flex items-center justify-center shadow-lg hover:bg-[#222] hover:border-[#4a4a4a] transition-colors text-xl"
        title="Notas rápidas"
        aria-label="Abrir notas rápidas"
      >
        📝
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={() => setIsOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed top-0 right-0 z-50 w-80 h-full bg-[#111] border-l border-[#2a2a2a] flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">📝</span>
                  <h2 className="text-sm font-semibold text-white">Notas rápidas</h2>
                </div>
                <div className="flex items-center gap-3">
                  <AnimatePresence>
                    {saved && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-green-400 font-medium"
                      >
                        ✓ Guardado
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                    aria-label="Cerrar"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleChange}
                placeholder="Escribe aquí..."
                className="flex-1 w-full bg-[#0f0f0f] text-gray-200 text-sm resize-none p-4 focus:outline-none placeholder-gray-600 leading-relaxed"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
