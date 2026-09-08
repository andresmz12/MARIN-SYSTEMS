'use client'

import { useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { svgToPng } from '@/lib/svg-export'
import { Shape, ShapeKind, Stroke, StrokePoint, TextBox, newId } from './types'

export interface InkCanvasHandle {
  exportPng: () => Promise<string>
}

interface InkCanvasProps {
  strokes: Stroke[]
  textBoxes: TextBox[]
  shapes: Shape[]
  onChangeStrokes: (strokes: Stroke[]) => void
  onChangeTextBoxes: (textBoxes: TextBox[]) => void
  onChangeShapes: (shapes: Shape[]) => void
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
const HIGHLIGHT_WIDTH = 22
const ERASER_RADIUS = 18
const TEXT_FONT_SIZE = 28
const SHAPE_KINDS: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: 'rect', label: 'Rectángulo', icon: '▭' },
  { kind: 'ellipse', label: 'Óvalo', icon: '◯' },
  { kind: 'line', label: 'Línea', icon: '╱' },
  { kind: 'arrow', label: 'Flecha', icon: '↗' },
]

type Tool = 'draw' | 'highlight' | 'erase' | 'text' | 'shape'

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

// Real eraser: cuts only the portion of a stroke under the eraser instead of
// deleting the whole stroke, splitting it into the surviving sub-runs.
function eraseStrokeAtPoint(stroke: Stroke, p: StrokePoint, radius: number): Stroke[] {
  const pts = stroke.points
  if (pts.length === 1) {
    return Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= radius ? [] : [stroke]
  }
  const keep: boolean[] = new Array(pts.length).fill(true)
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(p, pts[i], pts[i + 1]) <= radius) {
      keep[i] = false
      keep[i + 1] = false
    }
  }
  const runs: StrokePoint[][] = []
  let cur: StrokePoint[] = []
  for (let i = 0; i < pts.length; i++) {
    if (keep[i]) {
      cur.push(pts[i])
    } else {
      if (cur.length >= 2) runs.push(cur)
      cur = []
    }
  }
  if (cur.length >= 2) runs.push(cur)
  return runs.map((run) => ({ ...stroke, points: run }))
}

function eraseAtPoint(strokes: Stroke[], p: StrokePoint, radius: number): Stroke[] {
  return strokes.flatMap((s) => eraseStrokeAtPoint(s, p, radius))
}

// Shapes are simple geometric objects — erasing near their bounding box
// deletes the whole shape rather than trying to cut a partial arc/segment.
function shapeNearPoint(shape: Shape, p: StrokePoint, radius: number): boolean {
  const minX = Math.min(shape.x1, shape.x2) - radius
  const maxX = Math.max(shape.x1, shape.x2) + radius
  const minY = Math.min(shape.y1, shape.y2) - radius
  const maxY = Math.max(shape.y1, shape.y2) + radius
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
}

function eraseShapesAtPoint(shapes: Shape[], p: StrokePoint, radius: number): Shape[] {
  return shapes.filter((s) => !shapeNearPoint(s, p, radius))
}

// One `d` string for every shape kind so the live preview and the committed
// shape can share the exact same renderer (see shapePathD usages below).
function shapePathD(kind: ShapeKind, x1: number, y1: number, x2: number, y2: number): string {
  if (kind === 'rect') {
    return `M${x1},${y1} H${x2} V${y2} H${x1} Z`
  }
  if (kind === 'ellipse') {
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const rx = Math.abs(x2 - x1) / 2
    const ry = Math.abs(y2 - y1) / 2
    if (rx < 0.5 || ry < 0.5) return ''
    return `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`
  }
  if (kind === 'line') {
    return `M${x1},${y1} L${x2},${y2}`
  }
  // arrow: shaft + two-line arrowhead at the end point
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = 20
  const headAngle = Math.PI / 7
  const hx1 = x2 - headLen * Math.cos(angle - headAngle)
  const hy1 = y2 - headLen * Math.sin(angle - headAngle)
  const hx2 = x2 - headLen * Math.cos(angle + headAngle)
  const hy2 = y2 - headLen * Math.sin(angle + headAngle)
  return `M${x1},${y1} L${x2},${y2} M${hx1},${hy1} L${x2},${y2} L${hx2},${hy2}`
}

// Apple Pencil / high-frequency touch input reports faster than the browser
// paints (up to 240Hz on iPad Pro vs ~60fps rendering) — a single pointermove
// only carries the latest sample. getCoalescedEvents() returns every sample
// batched since the last event, so using it (falling back to the event itself
// where unsupported) is what keeps fast strokes from coming out as broken,
// disconnected dashes.
function getPointerSamples(e: React.PointerEvent): PointerEvent[] {
  const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }
  const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : null
  return coalesced && coalesced.length > 0 ? coalesced : [native]
}

interface UndoSnapshot { strokes: Stroke[]; shapes: Shape[] }

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { strokes, textBoxes, shapes, onChangeStrokes, onChangeTextBoxes, onChangeShapes },
  ref
) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(PEN_COLORS[0].value)
  const [width, setWidth] = useState(PEN_WIDTHS[1])
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const draggingText = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean } | null>(null)
  const undoStack = useRef<UndoSnapshot[]>([])
  const redoStack = useRef<UndoSnapshot[]>([])
  const drawing = useRef(false)
  // The in-progress stroke is tracked in a ref and painted by mutating the
  // <path> element's `d` attribute directly (see appendPoint) instead of
  // through React state. Calling setState on every pointermove forced a full
  // re-render per sample, which couldn't keep up with Apple Pencil's sample
  // rate and dropped points — the strokes came out broken/discontinuous.
  const currentPointsRef = useRef<StrokePoint[]>([])
  const currentPathRef = useRef<SVGPathElement>(null)
  const shapePreviewRef = useRef<SVGPathElement>(null)
  const shapeStartRef = useRef<StrokePoint | null>(null)
  const latestStrokesRef = useRef<Stroke[]>(strokes)
  const latestShapesRef = useRef<Shape[]>(shapes)
  latestStrokesRef.current = strokes
  latestShapesRef.current = shapes
  // Once a stylus has been seen on this device, ignore 'touch' pointer events
  // entirely — otherwise the palm resting on the screen while writing with
  // the Pencil draws its own stray strokes.
  const penDetectedRef = useRef(false)

  function toCanvasPoint(e: { clientX: number; clientY: number }): StrokePoint {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }

  function pushUndo() {
    undoStack.current.push({
      strokes: strokes.map((s) => ({ ...s, points: [...s.points] })),
      shapes: shapes.map((s) => ({ ...s })),
    })
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
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
    if (e.pointerType === 'pen') penDetectedRef.current = true
    if (e.pointerType === 'touch' && penDetectedRef.current) return

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
      pushUndo()
      onChangeStrokes(eraseAtPoint(latestStrokesRef.current, p, ERASER_RADIUS))
      onChangeShapes(eraseShapesAtPoint(latestShapesRef.current, p, ERASER_RADIUS))
    } else if (tool === 'shape') {
      pushUndo()
      shapeStartRef.current = p
      shapePreviewRef.current?.setAttribute('d', shapePathD(shapeKind, p.x, p.y, p.x, p.y))
    } else {
      currentPointsRef.current = [p]
      currentPathRef.current?.setAttribute('d', smoothPath(currentPointsRef.current))
    }
  }

  function appendPoint(p: StrokePoint) {
    currentPointsRef.current.push(p)
    currentPathRef.current?.setAttribute('d', smoothPath(currentPointsRef.current))
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'touch' && penDetectedRef.current) return

    if (draggingText.current) {
      const p = toCanvasPoint(e)
      const d = draggingText.current
      d.moved = true
      onChangeTextBoxes(textBoxes.map((tb) => (tb.id === d.id ? { ...tb, x: p.x - d.offsetX, y: p.y - d.offsetY } : tb)))
      return
    }
    if (!drawing.current) return
    if (tool === 'erase') {
      const p = toCanvasPoint(e)
      onChangeStrokes(eraseAtPoint(latestStrokesRef.current, p, ERASER_RADIUS))
      onChangeShapes(eraseShapesAtPoint(latestShapesRef.current, p, ERASER_RADIUS))
    } else if (tool === 'shape') {
      if (!shapeStartRef.current) return
      const p = toCanvasPoint(e)
      const start = shapeStartRef.current
      shapePreviewRef.current?.setAttribute('d', shapePathD(shapeKind, start.x, start.y, p.x, p.y))
    } else {
      // Replay every coalesced pencil sample since the last frame, not just the latest one.
      for (const sample of getPointerSamples(e)) {
        appendPoint(toCanvasPoint(sample))
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (draggingText.current) {
      draggingText.current = null
      return
    }
    drawing.current = false
    if (tool === 'draw' || tool === 'highlight') {
      if (currentPointsRef.current.length > 0) {
        pushUndo()
        onChangeStrokes([
          ...strokes,
          {
            color,
            width: tool === 'highlight' ? HIGHLIGHT_WIDTH : width,
            points: currentPointsRef.current,
            highlighter: tool === 'highlight',
          },
        ])
      }
      currentPointsRef.current = []
      currentPathRef.current?.setAttribute('d', '')
    } else if (tool === 'shape' && shapeStartRef.current) {
      const start = shapeStartRef.current
      const p = toCanvasPoint(e)
      if (Math.hypot(p.x - start.x, p.y - start.y) >= 4) {
        onChangeShapes([...shapes, { id: newId('shape'), kind: shapeKind, x1: start.x, y1: start.y, x2: p.x, y2: p.y, color, width }])
      } else {
        // Too small to be a real shape — the pushUndo() from pointerdown left
        // a stray checkpoint with nothing changed; drop it so undo stays clean.
        undoStack.current.pop()
      }
      shapeStartRef.current = null
      shapePreviewRef.current?.setAttribute('d', '')
    }
  }

  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push({ strokes, shapes })
    onChangeStrokes(prev.strokes)
    onChangeShapes(prev.shapes)
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push({ strokes, shapes })
    onChangeStrokes(next.strokes)
    onChangeShapes(next.shapes)
  }

  function clearAll() {
    if (strokes.length === 0 && textBoxes.length === 0 && shapes.length === 0) return
    pushUndo()
    onChangeStrokes([])
    onChangeTextBoxes([])
    onChangeShapes([])
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
          onClick={() => setTool('highlight')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${tool === 'highlight' ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          🖍️ Resaltador
        </button>
        <button
          type="button"
          onClick={() => setTool('text')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${tool === 'text' ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          🔤 Texto
        </button>
        <button
          type="button"
          onClick={() => setTool('shape')}
          className={`text-xs px-2.5 py-1.5 rounded-lg border ${tool === 'shape' ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
        >
          ▭ Formas
        </button>
        {tool === 'shape' && (
          <div className="flex items-center gap-1">
            {SHAPE_KINDS.map((s) => (
              <button
                key={s.kind}
                type="button"
                onClick={() => setShapeKind(s.kind)}
                aria-label={s.label}
                title={s.label}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm border ${shapeKind === s.kind ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                {s.icon}
              </button>
            ))}
          </div>
        )}
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
        {(tool === 'draw' || tool === 'shape') && (
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
        <button type="button" onClick={redo} className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--bg-border)] text-slate-400 hover:text-slate-200">
          ↪ Rehacer
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
          {shapes.map((shape) => (
            <path
              key={shape.id}
              d={shapePathD(shape.kind, shape.x1, shape.y1, shape.x2, shape.y2)}
              stroke={shape.color}
              strokeWidth={shape.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {/* Shape being dragged out — painted imperatively for the same reason as the ink preview below. */}
          <path ref={shapePreviewRef} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />

          {strokes.map((stroke, i) => (
            <path
              key={i}
              d={smoothPath(stroke.points)}
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={stroke.highlighter ? 0.4 : 1}
              style={stroke.highlighter ? { mixBlendMode: 'multiply' } : undefined}
            />
          ))}
          {/* In-progress stroke — its `d` is mutated directly via ref in appendPoint(),
              never through React state, so drawing never waits on a re-render. */}
          <path
            ref={currentPathRef}
            stroke={color}
            strokeWidth={tool === 'highlight' ? HIGHLIGHT_WIDTH : width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={tool === 'highlight' ? 0.4 : 1}
            style={tool === 'highlight' ? { mixBlendMode: 'multiply' } : undefined}
          />

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
