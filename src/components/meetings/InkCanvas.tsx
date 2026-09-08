'use client'

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'

export interface StrokePoint { x: number; y: number }
export interface Stroke { color: string; width: number; points: StrokePoint[] }

export interface InkCanvasHandle {
  /** Renders all strokes onto an offscreen canvas and returns a PNG data URL. */
  exportPng: () => string
}

interface InkCanvasProps {
  value: Stroke[]
  onChange: (strokes: Stroke[]) => void
}

// Fixed logical canvas size (roughly letter proportions) — the SVG scales to fit
// the screen via viewBox, but every stroke is stored in this coordinate space so
// it renders identically at any screen size and exports cleanly to PDF.
const CANVAS_W = 1000
const CANVAS_H = 1360

const PEN_COLORS = [
  { label: 'Negro', value: '#1a1a2e' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Verde', value: '#16a34a' },
]
const PEN_WIDTHS = [2, 4, 7]
const ERASER_RADIUS = 18

function smoothPath(points: StrokePoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y} L${points[0].x},${points[0].y}`
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2
    const midY = (points[i].y + points[i + 1].y) / 2
    d += ` Q${points[i].x},${points[i].y} ${midX},${midY}`
  }
  const last = points[points.length - 1]
  d += ` L${last.x},${last.y}`
  return d
}

function distToSegment(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

function strokeNearPoint(stroke: Stroke, p: StrokePoint, radius: number): boolean {
  if (stroke.points.length === 1) return Math.hypot(p.x - stroke.points[0].x, p.y - stroke.points[0].y) <= radius
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (distToSegment(p, stroke.points[i], stroke.points[i + 1]) <= radius) return true
  }
  return false
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas({ value, onChange }, ref) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [color, setColor] = useState(PEN_COLORS[0].value)
  const [width, setWidth] = useState(PEN_WIDTHS[1])
  const [erasing, setErasing] = useState(false)
  const [current, setCurrent] = useState<StrokePoint[] | null>(null)
  const undoStack = useRef<Stroke[][]>([])
  const drawing = useRef(false)

  function toCanvasPoint(e: React.PointerEvent<SVGSVGElement>): StrokePoint {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    const scaleY = CANVAS_H / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function pushUndo() {
    undoStack.current.push(value.map((s) => ({ ...s, points: [...s.points] })))
    if (undoStack.current.length > 50) undoStack.current.shift()
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drawing.current = true
    const p = toCanvasPoint(e)
    if (erasing) {
      pushUndo()
      onChange(value.filter((s) => !strokeNearPoint(s, p, ERASER_RADIUS)))
    } else {
      setCurrent([p])
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return
    const p = toCanvasPoint(e)
    if (erasing) {
      onChange(value.filter((s) => !strokeNearPoint(s, p, ERASER_RADIUS)))
    } else {
      setCurrent((pts) => (pts ? [...pts, p] : [p]))
    }
  }

  function handlePointerUp() {
    drawing.current = false
    if (!erasing && current && current.length > 0) {
      pushUndo()
      onChange([...value, { color, width, points: current }])
    }
    setCurrent(null)
  }

  function undo() {
    const prev = undoStack.current.pop()
    if (prev) onChange(prev)
  }

  function clearAll() {
    if (value.length === 0) return
    pushUndo()
    onChange([])
  }

  useImperativeHandle(ref, () => ({
    exportPng: () => {
      const canvas = document.createElement('canvas')
      canvas.width = CANVAS_W
      canvas.height = CANVAS_H
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const stroke of value) {
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = stroke.width
        ctx.stroke(new Path2D(smoothPath(stroke.points)))
      }
      return canvas.toDataURL('image/png')
    },
  }))

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--bg-border)]">
        {PEN_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => { setErasing(false); setColor(c.value) }}
            aria-label={c.label}
            className={`w-7 h-7 rounded-full border-2 transition-transform ${
              !erasing && color === c.value ? 'scale-110 border-cyan-400' : 'border-transparent'
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        <div className="w-px h-6 bg-[var(--bg-border)] mx-1" />
        {PEN_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => { setErasing(false); setWidth(w) }}
            aria-label={`Grosor ${w}`}
            className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
              !erasing && width === w ? 'border-cyan-400 bg-cyan-500/10' : 'border-transparent'
            }`}
          >
            <span className="rounded-full bg-current text-slate-300" style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
        <div className="w-px h-6 bg-[var(--bg-border)] mx-1" />
        <button
          type="button"
          onClick={() => setErasing((v) => !v)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${
            erasing ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'border-[var(--bg-border)] text-slate-400 hover:text-slate-200'
          }`}
        >
          🧹 Borrador
        </button>
        <button type="button" onClick={undo} className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--bg-border)] text-slate-400 hover:text-slate-200">
          ↩ Deshacer
        </button>
        <button type="button" onClick={clearAll} className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--bg-border)] text-slate-400 hover:text-red-400 ml-auto">
          Borrar todo
        </button>
      </div>

      {/* Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="w-full rounded-xl border border-[var(--bg-border)] shadow-inner touch-none select-none"
        style={{ background: '#fdfdfd', aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, cursor: erasing ? 'cell' : 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {value.map((stroke, i) => (
          <path
            key={i}
            d={smoothPath(stroke.points)}
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        {current && (
          <path d={smoothPath(current)} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        )}
      </svg>
    </div>
  )
})
