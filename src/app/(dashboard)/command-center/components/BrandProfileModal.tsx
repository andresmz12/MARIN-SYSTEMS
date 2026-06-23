'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from '@/components/ui/Toast'
import type { CEOCompany, BrandProfile } from '../types'

const TONES = ['Profesional', 'Cercano', 'Educativo', 'Inspiracional', 'Humorístico'] as const

interface Props {
  company: CEOCompany
  onClose: () => void
}

export function BrandProfileModal({ company, onClose }: Props) {
  const { showToast } = useToast()
  const [tone, setTone] = useState('Profesional')
  const [audience, setAudience] = useState('')
  const [pillars, setPillars] = useState<string[]>([])
  const [pillarInput, setPillarInput] = useState('')
  const [competitors, setCompetitors] = useState<string[]>([])
  const [competitorInput, setCompetitorInput] = useState('')
  const [voiceSamples, setVoiceSamples] = useState<string[]>([''])
  const [forbiddenWords, setForbiddenWords] = useState<string[]>([])
  const [forbiddenInput, setForbiddenInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [result, setResult] = useState<BrandProfile | null>(null)

  // Load existing profile
  useEffect(() => {
    fetch(`/api/ceo/brand-profile?companyId=${company.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: BrandProfile | null) => {
        if (data) {
          setTone(data.tone)
          setAudience(data.targetAudience)
          setPillars(data.contentPillars ?? [])
          setCompetitors((data.competitors as string[]) ?? [])
          setVoiceSamples(data.voiceSamples && data.voiceSamples.length > 0 ? data.voiceSamples : [''])
          setForbiddenWords(data.forbiddenWords ?? [])
          setResult(data)
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false))
  }, [company.id])

  function addPillar() {
    const val = pillarInput.trim()
    if (!val || pillars.length >= 5 || pillars.includes(val)) return
    setPillars((p) => [...p, val])
    setPillarInput('')
  }

  function addCompetitor() {
    const val = competitorInput.trim()
    if (!val || competitors.length >= 3 || competitors.includes(val)) return
    setCompetitors((c) => [...c, val])
    setCompetitorInput('')
  }

  function addForbiddenWord() {
    const val = forbiddenInput.trim()
    if (!val || forbiddenWords.includes(val)) return
    setForbiddenWords((w) => [...w, val])
    setForbiddenInput('')
  }

  function updateVoiceSample(index: number, value: string) {
    setVoiceSamples((prev) => prev.map((s, i) => (i === index ? value : s)))
  }

  function addVoiceSample() {
    if (voiceSamples.length >= 3) return
    setVoiceSamples((prev) => [...prev, ''])
  }

  function removeVoiceSample(index: number) {
    setVoiceSamples((prev) => prev.filter((_, i) => i !== index))
  }

  async function analyze() {
    if (!audience.trim() || pillars.length === 0) {
      showToast('Completa el público y al menos un pilar de contenido', 'error')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const cleanVoiceSamples = voiceSamples.map((s) => s.trim()).filter(Boolean)
      const res = await fetch('/api/ceo/brand-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id,
          tone,
          targetAudience: audience,
          contentPillars: pillars,
          competitors,
          voiceSamples: cleanVoiceSamples,
          forbiddenWords,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        showToast(err.error ?? 'Error al analizar', 'error')
        return
      }
      const data: BrandProfile = await res.json()
      setResult(data)
      showToast('✅ Perfil de marca guardado', 'success')
    } catch {
      showToast('Error al conectar con el servidor', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.93, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl my-8"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">🎯 Perfil de marca</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{company.emoji} {company.name}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
        </div>

        {fetching ? (
          <div className="p-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Tone */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">Tono de marca</label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button key={t} onClick={() => setTone(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      tone === t ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                    }`}
                  >{t}</button>
                ))}
              </div>
            </div>

            {/* Audience */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">Público objetivo</label>
              <textarea
                value={audience} onChange={(e) => setAudience(e.target.value)}
                rows={2} placeholder="Ej: Dueños de negocios latinos en USA, 30-50 años, interesados en optimizar impuestos"
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600 resize-none"
              />
            </div>

            {/* Content pillars */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">
                Pilares de contenido <span className="text-zinc-600">({pillars.length}/5)</span>
              </label>
              <div className="flex gap-2 mb-2">
                <input value={pillarInput} onChange={(e) => setPillarInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPillar() } }}
                  placeholder="Ej: Educación fiscal" maxLength={80}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                />
                <button onClick={addPillar} disabled={pillars.length >= 5}
                  className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm hover:bg-zinc-600 disabled:opacity-40">
                  Agregar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pillars.map((p) => (
                  <span key={p} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 text-xs border border-indigo-500/30">
                    {p}
                    <button onClick={() => setPillars((prev) => prev.filter((x) => x !== p))} className="ml-0.5 hover:text-white">✕</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Competitors */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">
                Competidores principales <span className="text-zinc-600">({competitors.length}/3)</span>
              </label>
              <div className="flex gap-2 mb-2">
                <input value={competitorInput} onChange={(e) => setCompetitorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor() } }}
                  placeholder="Nombre del competidor" maxLength={100}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                />
                <button onClick={addCompetitor} disabled={competitors.length >= 3}
                  className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm hover:bg-zinc-600 disabled:opacity-40">
                  Agregar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {competitors.map((c) => (
                  <span key={c} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-700/60 text-zinc-300 text-xs border border-zinc-600">
                    {c}
                    <button onClick={() => setCompetitors((prev) => prev.filter((x) => x !== c))} className="ml-0.5 hover:text-white">✕</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Voice samples */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">
                Ejemplos de voz <span className="text-zinc-600">({voiceSamples.filter(Boolean).length}/3)</span>
              </label>
              <p className="text-xs text-zinc-600 mb-2">Pega 1-3 textos que hayas escrito tú. La IA imitará tu estilo.</p>
              <div className="space-y-2">
                {voiceSamples.map((sample, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <textarea
                      value={sample}
                      onChange={(e) => updateVoiceSample(i, e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder={`Ejemplo ${i + 1}: escribe como hablarías a tus clientes…`}
                      className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600 resize-none"
                    />
                    {voiceSamples.length > 1 && (
                      <button onClick={() => removeVoiceSample(i)} className="text-zinc-600 hover:text-zinc-400 mt-1 text-sm">✕</button>
                    )}
                  </div>
                ))}
              </div>
              {voiceSamples.length < 3 && (
                <button onClick={addVoiceSample} className="mt-2 text-xs text-indigo-400 hover:text-indigo-300">
                  + Agregar otro ejemplo
                </button>
              )}
            </div>

            {/* Forbidden words */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">
                Palabras prohibidas <span className="text-zinc-600">({forbiddenWords.length})</span>
              </label>
              <p className="text-xs text-zinc-600 mb-2">Palabras o frases que la IA NUNCA debe usar.</p>
              <div className="flex gap-2 mb-2">
                <input
                  value={forbiddenInput}
                  onChange={(e) => setForbiddenInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addForbiddenWord() } }}
                  placeholder="Ej: gratis, oferta, urgente"
                  maxLength={100}
                  className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
                />
                <button onClick={addForbiddenWord} className="px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 text-sm hover:bg-zinc-600">
                  Agregar
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {forbiddenWords.map((w) => (
                  <span key={w} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 text-xs border border-red-500/30">
                    {w}
                    <button onClick={() => setForbiddenWords((prev) => prev.filter((x) => x !== w))} className="ml-0.5 hover:text-white">✕</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Analyze button */}
            <button onClick={analyze} disabled={loading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Investigando tu mercado…
                </>
              ) : '🔍 Analizar con IA'}
            </button>

            {/* Results */}
            <AnimatePresence>
              {result && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3"
                >
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Recomendaciones de la IA</p>
                  {result.bestDays && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">📅 Mejores días para publicar</p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.bestDays.map((d) => (
                          <span key={d} className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-200 text-xs">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.bestHours && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">🕐 Mejores horarios</p>
                      <div className="space-y-0.5">
                        {Object.entries(result.bestHours).map(([platform, hours]) => (
                          <p key={platform} className="text-xs text-zinc-300">
                            <span className="text-zinc-500 capitalize">{platform}:</span> {hours}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.competitorInsights && (
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">🔍 Insights de competencia</p>
                      <p className="text-xs text-zinc-300 leading-relaxed">{result.competitorInsights}</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
