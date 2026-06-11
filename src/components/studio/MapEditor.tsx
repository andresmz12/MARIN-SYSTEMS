'use client'

import { useState } from 'react'

interface HijoEdit  { id: string; texto: string; guion: string }
interface RamaEdit  { id: string; emoji?: string; texto: string; guion: string; color: string; hijos: HijoEdit[] }
interface CentroEdit { id: string; emoji?: string; texto: string; guion: string; color: string }

interface MapaEdit {
  centro: CentroEdit
  ramas: RamaEdit[]
  cta?: string
}

interface Props {
  mapaJson: any
  guion: string
  token: string
  onSaved: (mapaJson: any, guion: string) => void
}

function buildGuion(m: MapaEdit): string {
  const parts: string[] = []
  if (m.centro.guion) parts.push(m.centro.guion.trim())
  for (const r of m.ramas) {
    if (r.guion) parts.push(r.guion.trim())
    for (const h of r.hijos) { if (h.guion) parts.push(h.guion.trim()) }
  }
  if (m.cta) parts.push(m.cta.trim())
  return parts.join(' ')
}

function toEditable(raw: any): MapaEdit {
  return {
    centro: {
      id: raw.centro?.id ?? 'centro',
      emoji: raw.centro?.emoji,
      texto: raw.centro?.texto ?? '',
      guion: raw.centro?.guion ?? '',
      color: raw.centro?.color ?? '#1e3a5f',
    },
    ramas: (raw.ramas ?? []).map((r: any) => ({
      id: r.id ?? '',
      emoji: r.emoji,
      texto: r.texto ?? '',
      guion: r.guion ?? '',
      color: r.color ?? '#555',
      hijos: (r.hijos ?? []).map((h: any) => ({
        id: h.id ?? '',
        texto: h.texto ?? '',
        guion: h.guion ?? '',
      })),
    })),
    cta: raw.cta,
  }
}

const INPUT = {
  width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 7,
  border: '1px solid rgba(0,0,0,0.15)', outline: 'none', background: 'white',
  fontFamily: 'inherit', color: '#1e293b', boxSizing: 'border-box' as const,
}
const TEXTAREA = { ...INPUT, resize: 'vertical' as const, minHeight: 56, lineHeight: 1.4 }
const LABEL = { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function MapEditor({ mapaJson, token, onSaved }: Props) {
  const [mapa, setMapa]       = useState<MapaEdit>(() => toEditable(mapaJson))
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  // ─── Setters ───────────────────────────────────────────────
  function setCentro(field: 'texto' | 'guion', val: string) {
    setMapa(m => ({ ...m, centro: { ...m.centro, [field]: val } }))
  }
  function setRama(i: number, field: 'texto' | 'guion', val: string) {
    setMapa(m => {
      const ramas = [...m.ramas]
      ramas[i] = { ...ramas[i], [field]: val }
      return { ...m, ramas }
    })
  }
  function setHijo(i: number, j: number, field: 'texto' | 'guion', val: string) {
    setMapa(m => {
      const ramas = [...m.ramas]
      const hijos = [...ramas[i].hijos]
      hijos[j] = { ...hijos[j], [field]: val }
      ramas[i] = { ...ramas[i], hijos }
      return { ...m, ramas }
    })
  }

  // ─── Save ──────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    const newGuion = buildGuion(mapa)
    const newMapa  = {
      ...mapaJson,
      centro: { ...mapaJson.centro, texto: mapa.centro.texto, guion: mapa.centro.guion },
      ramas: mapaJson.ramas.map((r: any, i: number) => ({
        ...r,
        texto: mapa.ramas[i]?.texto ?? r.texto,
        guion: mapa.ramas[i]?.guion ?? r.guion,
        hijos: r.hijos.map((h: any, j: number) => ({
          ...h,
          texto: mapa.ramas[i]?.hijos[j]?.texto ?? h.texto,
          guion: mapa.ramas[i]?.hijos[j]?.guion ?? h.guion,
        })),
      })),
    }
    try {
      await fetch(`/api/studio/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapaJson: newMapa, guion: newGuion }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved(newMapa, newGuion)
    } finally {
      setSaving(false)
    }
  }

  const sectionStyle = (color: string): React.CSSProperties => ({
    borderLeft: `3px solid ${color}`, paddingLeft: 12, marginBottom: 20,
  })

  return (
    <div style={{ fontSize: 13, color: '#1e293b' }}>
      {/* CENTRO */}
      <div style={sectionStyle(mapa.centro.color)}>
        <div style={{ ...LABEL, color: mapa.centro.color, marginBottom: 8 }}>
          {mapa.centro.emoji} CENTRO
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={LABEL}>Texto del nodo</div>
          <input style={INPUT} value={mapa.centro.texto} onChange={e => setCentro('texto', e.target.value)} />
        </div>
        <div>
          <div style={LABEL}>Guion</div>
          <textarea style={TEXTAREA} value={mapa.centro.guion} onChange={e => setCentro('guion', e.target.value)} rows={2} />
        </div>
      </div>

      {/* RAMAS */}
      {mapa.ramas.map((r, i) => (
        <div key={r.id} style={{ marginBottom: 4 }}>
          <div style={sectionStyle(r.color)}>
            <div style={{ ...LABEL, color: r.color, marginBottom: 8 }}>
              {r.emoji} RAMA {i + 1}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={LABEL}>Texto del nodo</div>
              <input style={INPUT} value={r.texto} onChange={e => setRama(i, 'texto', e.target.value)} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={LABEL}>Guion</div>
              <textarea style={TEXTAREA} value={r.guion} onChange={e => setRama(i, 'guion', e.target.value)} rows={2} />
            </div>

            {/* HIJOS */}
            {r.hijos.map((h, j) => (
              <div key={h.id} style={{ marginLeft: 12, borderLeft: `2px solid ${r.color}40`, paddingLeft: 10, marginBottom: 10 }}>
                <div style={{ ...LABEL, marginBottom: 6 }}>Hijo {j + 1}</div>
                <div style={{ marginBottom: 4 }}>
                  <input style={{ ...INPUT, fontSize: 12 }} value={h.texto} onChange={e => setHijo(i, j, 'texto', e.target.value)} placeholder="Texto" />
                </div>
                <div>
                  <textarea style={{ ...TEXTAREA, fontSize: 12, minHeight: 44 }} value={h.guion} onChange={e => setHijo(i, j, 'guion', e.target.value)} rows={2} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
          background: saved ? '#16a34a' : '#2563eb', color: 'white',
          fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saving ? 'Guardando…' : saved ? '✅ Cambios guardados' : '💾 Guardar cambios'}
      </button>
    </div>
  )
}
