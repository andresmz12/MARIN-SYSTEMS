'use client'

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
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

// Fixed logical drawing space — every stroke/shape/text box is stored in
// these coordinates regardless of screen size, and the on-screen <canvas>
// (and the offscreen export canvas) both map onto it via a scale transform.
export const CANVAS_W = 1000
export const CANVAS_H = 1360
// Exported PNGs are rendered at a fixed higher resolution instead of
// capturing the live on-screen canvas, so a small phone screen doesn't
// produce a blurry export.
const EXPORT_SCALE = 2

const PEN_COLORS = [
  { label: 'Negro', value: '#1a1a2e' },
  { label: 'Azul', value: '#2563eb' },
  { label: 'Rojo', value: '#dc2626' },
  { label: 'Verde', value: '#16a34a' },
]
const PEN_WIDTHS = [2, 4, 7]
const HIGHLIGHT_WIDTH = 22
const ERASER_RADIUS = 26
const TEXT_FONT_SIZE = 28
const SHAPE_KINDS: { kind: ShapeKind; label: string; icon: string }[] = [
  { kind: 'rect', label: 'Rectángulo', icon: '▭' },
  { kind: 'ellipse', label: 'Óvalo', icon: '◯' },
  { kind: 'line', label: 'Línea', icon: '╱' },
  { kind: 'arrow', label: 'Flecha', icon: '↗' },
]

type Tool = 'draw' | 'highlight' | 'erase' | 'text' | 'shape'

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

// One SVG path-data string per shape kind, fed straight into Path2D so canvas
// can stroke it — reuses the exact same geometry for the live preview, the
// committed render, and the export.
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
// where unsupported) is what keeps fast strokes from coming out broken.
function getPointerSamples(e: React.PointerEvent): PointerEvent[] {
  const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }
  const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : null
  return coalesced && coalesced.length > 0 ? coalesced : [native]
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const pts = stroke.points
  if (pts.length === 0) return
  ctx.save()
  ctx.globalAlpha = stroke.highlighter ? 0.4 : 1
  if (stroke.highlighter) ctx.globalCompositeOperation = 'multiply'
  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  if (pts.length === 1) {
    ctx.moveTo(pts[0].x, pts[0].y)
    ctx.lineTo(pts[0].x, pts[0].y)
  } else {
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2
      const midY = (pts[i].y + pts[i + 1].y) / 2
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
    }
    const last = pts[pts.length - 1]
    ctx.lineTo(last.x, last.y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
  const d = shapePathD(shape.kind, shape.x1, shape.y1, shape.x2, shape.y2)
  if (!d) return
  ctx.save()
  ctx.strokeStyle = shape.color
  ctx.lineWidth = shape.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(d))
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, tb: TextBox) {
  ctx.save()
  ctx.fillStyle = tb.color
  ctx.font = `${tb.fontSize}px Inter, sans-serif`
  ctx.textBaseline = 'alphabetic'
  tb.text.split('\n').forEach((line, i) => {
    ctx.fillText(line, tb.x, tb.y + i * tb.fontSize * 1.2)
  })
  ctx.restore()
}

// Straight segment painted immediately as the pointer moves, for instant
// feedback — the committed stroke gets the nicer quadratic smoothing from
// drawStroke() once it lands in state. This is the standard "signature pad"
// technique: cheap per-point painting instead of a full-scene redraw for
// every sample, which is what lets it keep up with a fast stroke.
function paintLiveSegment(
  ctx: CanvasRenderingContext2D,
  from: StrokePoint,
  to: StrokePoint,
  color: string,
  width: number,
  highlighter: boolean
) {
  ctx.save()
  ctx.globalAlpha = highlighter ? 0.4 : 1
  if (highlighter) ctx.globalCompositeOperation = 'multiply'
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(
  { strokes, textBoxes, shapes, onChangeStrokes, onChangeTextBoxes, onChangeShapes },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<Tool>('draw')
  const [color, setColor] = useState(PEN_COLORS[0].value)
  const [width, setWidth] = useState(PEN_WIDTHS[1])
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const draggingText = useRef<{ id: string; offsetX: number; offsetY: number; moved: boolean } | null>(null)
  const undoStack = useRef<{ strokes: Stroke[]; shapes: Shape[] }[]>([])
  const redoStack = useRef<{ strokes: Stroke[]; shapes: Shape[] }[]>([])
  const drawing = useRef(false)
  const currentPointsRef = useRef<StrokePoint[]>([])
  const shapeStartRef = useRef<StrokePoint | null>(null)
  // The pointerId currently driving a draw/erase/shape gesture, if any. Only
  // this pointer's events are acted on; any other concurrent contact (a palm
  // resting on the screen while writing with the Pencil, most commonly) is
  // ignored outright rather than being allowed to interrupt the gesture.
  const activePointerIdRef = useRef<number | null>(null)

  // Mirrors of the latest props, read by drawSceneOn() so a redraw triggered
  // from a stale closure (e.g. a ResizeObserver callback registered on mount)
  // never paints outdated content.
  const latestStrokesRef = useRef<Stroke[]>(strokes)
  const latestShapesRef = useRef<Shape[]>(shapes)
  const latestTextBoxesRef = useRef<TextBox[]>(textBoxes)
  const latestEditingIdRef = useRef<string | null>(editingId)
  latestStrokesRef.current = strokes
  latestShapesRef.current = shapes
  latestTextBoxesRef.current = textBoxes
  latestEditingIdRef.current = editingId

  function toCanvasPoint(e: { clientX: number; clientY: number }): StrokePoint {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }

  function drawSceneOn(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    ctx.fillStyle = '#fdfdfd'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    for (const shape of latestShapesRef.current) drawShape(ctx, shape)
    for (const stroke of latestStrokesRef.current) drawStroke(ctx, stroke)
    for (const tb of latestTextBoxesRef.current) {
      if (tb.id === latestEditingIdRef.current) continue
      drawText(ctx, tb)
    }
  }

  function redraw() {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) drawSceneOn(ctx)
  }

  function setupCanvasSize() {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const cssWidth = container.clientWidth
    if (cssWidth === 0) return
    const cssHeight = cssWidth * (CANVAS_H / CANVAS_W)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const scale = (cssWidth * dpr) / CANVAS_W
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    redraw()
  }

  useEffect(() => {
    setupCanvasSize()
    const ro = new ResizeObserver(() => setupCanvasSize())
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, shapes, textBoxes, editingId])

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

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (editingId) commitEditing()

    // A second concurrent contact (typically a resting palm while the Pencil
    // is down) is ignored outright instead of hijacking the in-progress
    // gesture. Works regardless of pointerType, so it doesn't depend on
    // correctly detecting "this is a stylus" — the earlier approach (ignore
    // all touch once any 'pen' event is ever seen) was both too aggressive
    // (a single stray Pencil hover could lock out all finger drawing for the
    // rest of the session) and too weak (a concurrent palm touch still reset
    // an in-progress stroke, since it was never rejected at pointerdown).
    if (activePointerIdRef.current !== null && activePointerIdRef.current !== e.pointerId) return
    activePointerIdRef.current = e.pointerId
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toCanvasPoint(e)

    if (tool === 'text') {
      activePointerIdRef.current = null // discrete tap, not a sustained gesture
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
    } else {
      currentPointsRef.current = [p]
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) paintLiveSegment(ctx, p, p, color, tool === 'highlight' ? HIGHLIGHT_WIDTH : width, tool === 'highlight')
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerId !== activePointerIdRef.current) return // a different, ignored contact (e.g. palm)
    if (!drawing.current) return

    if (tool === 'erase') {
      const p = toCanvasPoint(e)
      onChangeStrokes(eraseAtPoint(latestStrokesRef.current, p, ERASER_RADIUS))
      onChangeShapes(eraseShapesAtPoint(latestShapesRef.current, p, ERASER_RADIUS))
    } else if (tool === 'shape') {
      if (!shapeStartRef.current) return
      const p = toCanvasPoint(e)
      const start = shapeStartRef.current
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        drawSceneOn(ctx)
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const d = shapePathD(shapeKind, start.x, start.y, p.x, p.y)
        if (d) ctx.stroke(new Path2D(d))
        ctx.restore()
      }
    } else {
      const ctx = canvasRef.current?.getContext('2d')
      // Replay every coalesced pencil sample since the last frame, not just the latest one.
      for (const sample of getPointerSamples(e)) {
        const p = toCanvasPoint(sample)
        const prev = currentPointsRef.current[currentPointsRef.current.length - 1]
        currentPointsRef.current.push(p)
        if (ctx && prev) paintLiveSegment(ctx, prev, p, color, tool === 'highlight' ? HIGHLIGHT_WIDTH : width, tool === 'highlight')
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerId !== activePointerIdRef.current) return // a different, ignored contact (e.g. palm) lifted
    activePointerIdRef.current = null
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
      redraw()
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
      const off = document.createElement('canvas')
      off.width = CANVAS_W * EXPORT_SCALE
      off.height = CANVAS_H * EXPORT_SCALE
      const ctx = off.getContext('2d')
      if (!ctx) return ''
      ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0)
      drawSceneOn(ctx)
      return off.toDataURL('image/png')
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
      <div ref={containerRef} className="relative w-full" style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full rounded-xl border border-[var(--bg-border)] shadow-inner touch-none select-none"
          style={{ background: '#fdfdfd', touchAction: 'none', cursor: tool === 'erase' ? 'cell' : tool === 'text' ? 'text' : 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Drag/edit handles for text boxes — HTML overlay siblings of the
            canvas (a canvas can't host interactive children). Tap without
            dragging opens the text for editing; dragging moves it. */}
        {tool === 'text' &&
          textBoxes
            .filter((tb) => tb.id !== editingId)
            .map((tb) => (
              <div
                key={tb.id}
                role="button"
                tabIndex={-1}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
                  const p = toCanvasPoint(e)
                  draggingText.current = { id: tb.id, offsetX: p.x - tb.x, offsetY: p.y - tb.y, moved: false }
                }}
                onPointerMove={(e) => {
                  const d = draggingText.current
                  if (!d || d.id !== tb.id) return
                  const p = toCanvasPoint(e)
                  d.moved = true
                  onChangeTextBoxes(textBoxes.map((t) => (t.id === d.id ? { ...t, x: p.x - d.offsetX, y: p.y - d.offsetY } : t)))
                }}
                onPointerUp={(e) => {
                  e.stopPropagation()
                  const d = draggingText.current
                  draggingText.current = null
                  if (d && d.id === tb.id && !d.moved) startEditingBox(tb)
                }}
                className="absolute w-6 h-6 rounded-full bg-cyan-400 border border-black/70 cursor-move touch-none"
                style={{
                  left: `${((tb.x - 16) / CANVAS_W) * 100}%`,
                  top: `${((tb.y - tb.fontSize / 2 - 10) / CANVAS_H) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}

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
