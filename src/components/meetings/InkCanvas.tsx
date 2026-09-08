'use client'

import { useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { svgToPng } from '@/lib/svg-export'
import { Stroke, StrokePoint, TextBox, newId } from './types'

export interface InkCanvasHandle {
  exportPng: () => Promise<string>
}

interface InkCanvasProps {
  strokes: Stroke[]
  textBoxes: TextBox[]
  onChangeStrokes: (strokes: Stroke[]) => void
  onChangeTextBoxes: (textBoxes: TextBox[]) => void
}

// Fixed logical canvas size (roughly letter proportions) — the SVG scales to fit
// the screen via viewBox, but every stroke/text box is stored in this coordinate
// space so it renders identically at any screen size and exports cleanly.
export const CANVAS_W = 1000
export const CANVAS_H = 1360

const PEN_COLORS = [
  { label: 'Negro', value: '#1a1a2e' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Verde', value: '#16a34a' },
]
const PEN_WIDTHS = [2, 4, 7]
const ERASER_RADIUS = 18
const TEXT_FONT_SIZE = 28

type Tool = 'draw' | 'erase' | 'text'

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
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function strokeNearPoint(stroke: Stroke, p: StrokePoint, radius: number): boolean {
  if (stroke.points.length === 1) return Math.hypot(p.x - stroke.points[0].x, p.y - stroke.points[0].y) <= radius
  for (let i = 0; i < stroke.points.length - 1; i++) {
    if (distToSegment(p, stroke.points[i], stroke.points[i + 1]) <= radius) return true
  }
  return false
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { strokes, textBoxes, onChangeStrokes, onChangeTextBoxes },
  ref
) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(PEN_COLORS[0].value)
  const [width, setWidth] = useState(PEN_WIDTHS[1])
  const [current, setCurrent] = useState<StrokePoint[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const draggingText = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean } | null>(null)
  const strokeUndoStack = useRef<Stroke[][]>([])
  const drawing = useRef(false)

  function toCanvasPoint(e: { clientX: number; clientY: number }): StrokePoint {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }

  function pushStrokeUndo() {
    strokeUndoStack.current.push(strokes.map((s) => ({ ...s, points: [...s.points] })))
    if (strokeUndoStack.current.length > 50) strokeUndoStack.current.shift()
  }

  function startEditingBox(tb: TextBox) {
    setEditingId(tb.id)
    setEditingValue(tb.text)
  }

  function commitEditing() {
    if (!editingId) return
    const trimmed = editingValue
    if (trimmed.trim()) {
      onChangeTextBoxes(textBoxes.map((tb) => (tb.id === editingId ? { ...tb, text: trimmed } : tb)))
    } else {
      onChangeTextBoxes(textBoxes.filter((tb) => tb.id !== editingId))
    }
    setEditingId(null)
    setEditingValue('')
  }

  function handleTextHandleDown(tb: TextBox, e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toCanvasPoint(e)
    draggingText.current = { id: tb.id, offsetX: p.x - tb.x, offsetY: p.y - tb.y, moved: false }
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (editingId) commitEditing()
    if (draggingText.current) return // handled by the handle's own pointer events

    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toCanvasPoint(e)

    if (tool === 'text') {
      const box: TextBox = { id: newId('text'), x: p.x, y: p.y, text: '', color, fontSize: TEXT_FONT_SIZE }
      onChangeTextBoxes([...textBoxes, box])
      startEditingBox(box)
      return
    }

    drawing.current = true
    if (tool === 'erase') {
      pushStrokeUndo()
      onChangeStrokes(strokes.filter((s) => !strokeNearPoint(s, p, ERASER_RADIUS)))
    } else {
      setCurrent([p])
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (draggingText.current) {
      const p = toCanvasPoint(e)
      const d = draggingText.current
      d.moved = true
      onChangeTextBoxes(textBoxes.map((tb) => (tb.id === d.id ? { ...tb, x: p.x - d.offsetX, y: p.y - d.offsetY } : tb)))
      return
    }
    if (!drawing.current) return
    const p = toCanvasPoint(e)
    if (tool === 'erase') {
      onChangeStrokes(strokes.filter((s) => !strokeNearPoint(s, p, ERASER_RADIUS)))
    } else {
      setCurrent((pts) => (pts ? [...pts, p] : [p]))
    }
  }

  function handlePointerUp() {
    if (draggingText.current) {
      draggingText.current = null
      return
    }
    drawing.current = false
    if (tool === 'draw' && current && current.length > 0) {
      pushStrokeUndo()
      onChangeStrokes([...strokes, { color, width, points: current }])
    }
    setCurrent(null)
  }

  function undo() {
    const prev = strokeUndoStack.current.pop()
    if (prev) onChangeStrokes(prev)
  }

  function clearAll() {
    if (strokes.length === 0 && textBoxes.length === 0) return
    pushStrokeUndo()
    onChangeStrokes([])
    onChangeTextBoxes([])
  }

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (!svgRef.current) return ''
      return svgToPng(svgRef.current, CANVAS_W, CANVAS_H)
    },
  }))

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--bg-border)]">
        <button
          type="button"
          onClick={() => setTool('draw')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${tool === 'draw' ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          ✍️ Lápiz
        </button>
        <button
          type="button"
          onClick={() => setTool('text')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${tool === 'text' ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          🔤 Texto
        </button>
        <div className="w-px h-6 bg-[var(--bg-border)] mx-1" />
        {PEN_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => { setTool((t) => (t === 'erase' ? 'draw' : t)); setColor(c.value) }}
            aria-label={c.label}
            className={`w-7 h-7 rounded-full border-2 transition-transform ${
              tool !== 'erase' && color === c.value ? 'scale-110 border-cyan-400' : 'border-transparent'
            }`}
            style={{ backgroundColor: c.value }}
          />
        ))}
        {tool === 'draw' && (
          <>
            <div className="w-px h-6 bg-[var(--bg-border)] mx-1" />
            {PEN_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                aria-label={`Grosor ${w}`}
                className={`w-7 h-7 rounded-lg flex items-center justify-center border ${width === w ? 'border-cyan-400 bg-cyan-500/10' : 'border-transparent'}`}
              >
                <span className="rounded-full bg-current text-slate-300" style={{ width: w + 2, height: w + 2 }} />
              </button>
            ))}
          </>
        )}
        <div className="w-px h-6 bg-[var(--bg-border)] mx-1" />
        <button
          type="button"
          onClick={() => setTool((t) => (t === 'erase' ? 'draw' : 'erase'))}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${tool === 'erase' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'border-[var(--bg-border)] text-slate-400 hover:text-slate-200'}`}
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
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full rounded-xl border border-[var(--bg-border)] shadow-inner touch-none select-none"
          style={{ background: '#fdfdfd', aspectRatio: `${CANVAS_W} / ${CANVAS_H}`, cursor: tool === 'erase' ? 'cell' : tool === 'text' ? 'text' : 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {strokes.map((stroke, i) => (
            <path key={i} d={smoothPath(stroke.points)} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
          {current && <path d={smoothPath(current)} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />}

          {textBoxes.filter((tb) => tb.id !== editingId).map((tb) => (
            <g key={tb.id}>
              <text
                x={tb.x}
                y={tb.y}
                fill={tb.color}
                fontSize={tb.fontSize}
                fontFamily="Inter, sans-serif"
                onPointerDown={(e) => { if (tool === 'text') { e.stopPropagation(); startEditingBox(tb) } }}
              >
                {tb.text.split('\n').map((line, i) => (
                  <tspan key={i} x={tb.x} dy={i === 0 ? 0 : tb.fontSize * 1.2}>{line}</tspan>
                ))}
              </text>
              {tool === 'text' && (
                <circle
                  cx={tb.x - 16}
                  cy={tb.y - tb.fontSize / 2}
                  r={10}
                  fill="#22d3ee"
                  stroke="#0a0a0a"
                  strokeWidth={1}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => handleTextHandleDown(tb, e)}
                />
              )}
            </g>
          ))}
        </svg>

        {editingId && (() => {
          const tb = textBoxes.find((t) => t.id === editingId)
          if (!tb) return null
          return (
            <textarea
              autoFocus
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={commitEditing}
              onKeyDown={(e) => { if (e.key === 'Escape') commitEditing() }}
              className="absolute bg-white/95 border-2 border-cyan-400 rounded px-1.5 py-1 outline-none resize"
              style={{
                left: `${(tb.x / CANVAS_W) * 100}%`,
                top: `${((tb.y - tb.fontSize) / CANVAS_H) * 100}%`,
                fontSize: 16,
                color: tb.color,
                minWidth: '140px',
                minHeight: '44px',
              }}
            />
          )
        })()}
      </div>
    </div>
  )
})
