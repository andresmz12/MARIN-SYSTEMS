'use client'

import { useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { svgToPng } from '@/lib/svg-export'
import { MindBranch, MindNode, MindmapPage, newId } from './types'

export interface MindMapCanvasHandle {
  exportPng: () => Promise<string>
}

interface MindMapCanvasProps {
  page: MindmapPage
  onChange: (page: MindmapPage) => void
}

const CANVAS_W = 1000
const CANVAS_H = 800
const NODE_COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#f87171']

function qbez(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  return `M${x1},${y1} Q${mx},${y1} ${mx},${my} T${x2},${y2}`
}

export const MindMapCanvas = forwardRef<MindMapCanvasHandle, MindMapCanvasProps>(function MindMapCanvas(
  { page, onChange },
  ref
) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  function toCanvasPoint(e: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    }
  }

  function findNode(id: string): MindNode | undefined {
    if (page.center.id === id) return page.center
    for (const b of page.branches) {
      if (b.id === id) return b
      const c = b.children.find((h) => h.id === id)
      if (c) return c
    }
    return undefined
  }

  function updateNodePosition(id: string, x: number, y: number) {
    if (page.center.id === id) {
      onChange({ ...page, center: { ...page.center, x, y } })
      return
    }
    onChange({
      ...page,
      branches: page.branches.map((b) =>
        b.id === id
          ? { ...b, x, y }
          : { ...b, children: b.children.map((c) => (c.id === id ? { ...c, x, y } : c)) }
      ),
    })
  }

  function updateNodeText(id: string, text: string) {
    if (page.center.id === id) {
      onChange({ ...page, center: { ...page.center, text } })
      return
    }
    onChange({
      ...page,
      branches: page.branches.map((b) =>
        b.id === id
          ? { ...b, text }
          : { ...b, children: b.children.map((c) => (c.id === id ? { ...c, text } : c)) }
      ),
    })
  }

  function addBranch() {
    const angle = (page.branches.length / Math.max(6, page.branches.length + 1)) * Math.PI * 2
    const branch: MindBranch = {
      id: newId('branch'),
      text: 'Nueva rama',
      color: NODE_COLORS[page.branches.length % NODE_COLORS.length],
      x: page.center.x + Math.cos(angle) * 260,
      y: page.center.y + Math.sin(angle) * 200,
      children: [],
    }
    onChange({ ...page, branches: [...page.branches, branch] })
  }

  function addChild(branchId: string) {
    onChange({
      ...page,
      branches: page.branches.map((b) => {
        if (b.id !== branchId) return b
        const child: MindNode = {
          id: newId('child'),
          text: 'Idea',
          color: b.color,
          x: b.x + 140,
          y: b.y + 40 * (b.children.length + 1),
        }
        return { ...b, children: [...b.children, child] }
      }),
    })
  }

  function deleteNode(id: string) {
    onChange({
      ...page,
      branches: page.branches.filter((b) => b.id !== id).map((b) => ({ ...b, children: b.children.filter((c) => c.id !== id) })),
    })
  }

  function handlePointerDownNode(node: MindNode, e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toCanvasPoint(e)
    dragging.current = { id: node.id, offsetX: p.x - node.x, offsetY: p.y - node.y }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragging.current) return
    const p = toCanvasPoint(e)
    updateNodePosition(dragging.current.id, p.x - dragging.current.offsetX, p.y - dragging.current.offsetY)
  }

  function handlePointerUp() {
    dragging.current = null
  }

  function startEditing(node: MindNode) {
    setEditingId(node.id)
    setEditingValue(node.text)
  }

  function commitEditing() {
    if (editingId) updateNodeText(editingId, editingValue.trim() || 'Sin título')
    setEditingId(null)
  }

  useImperativeHandle(ref, () => ({
    exportPng: async () => {
      if (!svgRef.current) return ''
      return svgToPng(svgRef.current, CANVAS_W, CANVAS_H)
    },
  }))

  const editingNode = editingId ? findNode(editingId) : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--bg-border)]">
        <button type="button" onClick={addBranch} className="text-xs px-2.5 py-1.5 rounded-lg border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/10">
          + Rama
        </button>
        <p className="text-[11px] text-slate-500 ml-2">Toca un nodo para editarlo · arrástralo para moverlo</p>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          className="w-full rounded-xl border border-[var(--bg-border)] touch-none select-none"
          style={{ background: '#0b0d12', aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {page.branches.map((b) => (
            <g key={`line-${b.id}`}>
              <path d={qbez(page.center.x, page.center.y, b.x, b.y)} stroke={b.color} strokeWidth={2} fill="none" opacity={0.6} />
              {b.children.map((c) => (
                <path key={`line-${c.id}`} d={qbez(b.x, b.y, c.x, c.y)} stroke={b.color} strokeWidth={1.5} fill="none" opacity={0.4} />
              ))}
            </g>
          ))}

          {/* Center */}
          <g onPointerDown={(e) => handlePointerDownNode(page.center, e)} onDoubleClick={() => startEditing(page.center)} style={{ cursor: 'grab' }}>
            <rect x={page.center.x - 90} y={page.center.y - 26} width={180} height={52} rx={14} fill={page.center.color} opacity={0.9} />
            <text x={page.center.x} y={page.center.y + 5} textAnchor="middle" fill="#0a0a0a" fontSize={16} fontWeight={700}>
              {page.center.text.slice(0, 22)}
            </text>
          </g>

          {/* Branches + children */}
          {page.branches.map((b) => (
            <g key={b.id}>
              <g onPointerDown={(e) => handlePointerDownNode(b, e)} onDoubleClick={() => startEditing(b)} style={{ cursor: 'grab' }}>
                <rect x={b.x - 70} y={b.y - 20} width={140} height={40} rx={10} fill={b.color} opacity={0.85} />
                <text x={b.x} y={b.y + 5} textAnchor="middle" fill="#0a0a0a" fontSize={13} fontWeight={600}>
                  {b.text.slice(0, 18)}
                </text>
              </g>
              <g onPointerDown={(e) => { e.stopPropagation(); addChild(b.id) }} style={{ cursor: 'pointer' }}>
                <circle cx={b.x + 78} cy={b.y - 24} r={9} fill="#1a1f2b" stroke={b.color} strokeWidth={1.5} />
                <text x={b.x + 78} y={b.y - 20} textAnchor="middle" fill={b.color} fontSize={13}>+</text>
              </g>
              <g onPointerDown={(e) => { e.stopPropagation(); deleteNode(b.id) }} style={{ cursor: 'pointer' }}>
                <circle cx={b.x - 78} cy={b.y - 24} r={9} fill="#1a1f2b" stroke="#f87171" strokeWidth={1.5} />
                <text x={b.x - 78} y={b.y - 20} textAnchor="middle" fill="#f87171" fontSize={12}>×</text>
              </g>

              {b.children.map((c) => (
                <g key={c.id} onPointerDown={(e) => handlePointerDownNode(c, e)} onDoubleClick={() => startEditing(c)} style={{ cursor: 'grab' }}>
                  <rect x={c.x - 60} y={c.y - 16} width={120} height={32} rx={8} fill="var(--bg-elevated)" stroke={c.color} strokeWidth={1.5} />
                  <text x={c.x} y={c.y + 4} textAnchor="middle" fill={c.color} fontSize={11}>{c.text.slice(0, 16)}</text>
                  <g onPointerDown={(e) => { e.stopPropagation(); deleteNode(c.id) }} style={{ cursor: 'pointer' }}>
                    <circle cx={c.x + 66} cy={c.y - 16} r={7} fill="#1a1f2b" stroke="#f87171" strokeWidth={1.2} />
                    <text x={c.x + 66} y={c.y - 12.5} textAnchor="middle" fill="#f87171" fontSize={10}>×</text>
                  </g>
                </g>
              ))}
            </g>
          ))}
        </svg>

        {editingNode && (
          <input
            autoFocus
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={commitEditing}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') commitEditing() }}
            className="absolute -translate-x-1/2 -translate-y-1/2 bg-white text-black text-sm rounded px-2 py-1 border-2 border-cyan-400 outline-none"
            style={{
              left: `${(editingNode.x / CANVAS_W) * 100}%`,
              top: `${(editingNode.y / CANVAS_H) * 100}%`,
              minWidth: '140px',
            }}
          />
        )}
      </div>
    </div>
  )
})
