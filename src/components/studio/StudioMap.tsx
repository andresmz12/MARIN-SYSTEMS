'use client'

import { useEffect, useRef, useState } from 'react'

interface HijoNode {
  id: string
  texto: string
  color: string
  explicacion?: string
}

interface RamaNode {
  id: string
  emoji?: string
  texto: string
  color: string
  explicacion?: string
  hijos: HijoNode[]
}

export interface MapaJsonStudio {
  centro: {
    id: string
    emoji?: string
    texto: string
    color: string
    explicacion?: string
  }
  ramas: RamaNode[]
}

interface Props {
  mapa: MapaJsonStudio
}

const BRANCH_ANGLES: Record<number, number[]> = {
  1: [0],
  2: [-90, 90],
  3: [-120, 0, 120],
  4: [-120, -45, 45, 120],
  5: [-90, -18, 54, 126, 198],
}

function toRad(deg: number) { return (deg * Math.PI) / 180 }

function qbez(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const cx = mx + (my - y1) * 0.3
  const cy = my - (mx - x1) * 0.3
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`
}

export default function StudioMap({ mapa }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ w: width, h: height })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const cx = w / 2
  const cy = h * 0.45
  const R = Math.min(w, h)
  const branchDist = R * 0.30
  const childDist = R * 0.17

  const { centro, ramas } = mapa
  const nBranches = ramas.length
  const angles = BRANCH_ANGLES[nBranches] ?? ramas.map((_, i) => -120 + (240 / Math.max(nBranches - 1, 1)) * i)

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg width={w} height={h} style={{ display: 'block' }}>
        <defs>
          <filter id="sm-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,0,0,0.12)" />
          </filter>
        </defs>

        {/* Lines: center → branches */}
        {ramas.map((rama, i) => {
          const angle = toRad(angles[i])
          const bx = cx + Math.cos(angle) * branchDist
          const by = cy + Math.sin(angle) * branchDist
          return (
            <path key={`lc${i}`} d={qbez(cx, cy, bx, by)}
              stroke={rama.color} strokeWidth={2} fill="none" opacity={0.45} />
          )
        })}

        {/* Lines: branches → children */}
        {ramas.map((rama, i) => {
          const angle = toRad(angles[i])
          const bx = cx + Math.cos(angle) * branchDist
          const by = cy + Math.sin(angle) * branchDist
          return rama.hijos.map((hijo, j) => {
            const spread = rama.hijos.length === 1 ? 0 : (j - (rama.hijos.length - 1) / 2)
            const childAngle = angle + toRad(spread * 30)
            const hx = bx + Math.cos(childAngle) * childDist
            const hy = by + Math.sin(childAngle) * childDist
            return (
              <path key={`lr${i}h${j}`} d={qbez(bx, by, hx, hy)}
                stroke={hijo.color} strokeWidth={1.4} fill="none" opacity={0.45} />
            )
          })
        })}

        {/* Child nodes */}
        {ramas.map((rama, i) => {
          const angle = toRad(angles[i])
          const bx = cx + Math.cos(angle) * branchDist
          const by = cy + Math.sin(angle) * branchDist
          return rama.hijos.map((hijo, j) => {
            const spread = rama.hijos.length === 1 ? 0 : (j - (rama.hijos.length - 1) / 2)
            const childAngle = angle + toRad(spread * 30)
            const hx = bx + Math.cos(childAngle) * childDist
            const hy = by + Math.sin(childAngle) * childDist
            const nw = 72, nh = 46
            return (
              <g key={hijo.id} filter="url(#sm-shadow)">
                <rect x={hx - nw / 2} y={hy - nh / 2} width={nw} height={nh} rx={8}
                  fill="white" stroke={hijo.color} strokeWidth={1.5} />
                <foreignObject x={hx - nw / 2 + 2} y={hy - nh / 2 + 2} width={nw - 4} height={nh - 4}>
                  {/* @ts-expect-error xmlns for SVG foreignObject */}
                  <div xmlns="http://www.w3.org/1999/xhtml"
                    style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10, color: hijo.color, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
                      {hijo.texto}
                    </span>
                  </div>
                </foreignObject>
              </g>
            )
          })
        })}

        {/* Branch nodes */}
        {ramas.map((rama, i) => {
          const angle = toRad(angles[i])
          const bx = cx + Math.cos(angle) * branchDist
          const by = cy + Math.sin(angle) * branchDist
          const nw = 82, nh = 60
          return (
            <g key={rama.id} filter="url(#sm-shadow)">
              <rect x={bx - nw / 2} y={by - nh / 2} width={nw} height={nh} rx={12}
                fill="white" stroke={rama.color} strokeWidth={2} />
              <foreignObject x={bx - nw / 2 + 3} y={by - nh / 2 + 3} width={nw - 6} height={nh - 6}>
                {/* @ts-expect-error xmlns for SVG foreignObject */}
                <div xmlns="http://www.w3.org/1999/xhtml"
                  style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {rama.emoji && <span style={{ fontSize: 13, lineHeight: 1 }}>{rama.emoji}</span>}
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, color: rama.color, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
                    {rama.texto}
                  </span>
                </div>
              </foreignObject>
            </g>
          )
        })}

        {/* Center node */}
        {(() => {
          const nw = 100, nh = 72
          return (
            <g filter="url(#sm-shadow)">
              <rect x={cx - nw / 2} y={cy - nh / 2} width={nw} height={nh} rx={16}
                fill="white" stroke={centro.color} strokeWidth={2.5} />
              <foreignObject x={cx - nw / 2 + 4} y={cy - nh / 2 + 4} width={nw - 8} height={nh - 8}>
                {/* @ts-expect-error xmlns for SVG foreignObject */}
                <div xmlns="http://www.w3.org/1999/xhtml"
                  style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {centro.emoji && <span style={{ fontSize: 16, lineHeight: 1 }}>{centro.emoji}</span>}
                  <span style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: centro.color, textAlign: 'center', lineHeight: 1.2, fontWeight: 700, wordBreak: 'break-word' }}>
                    {centro.texto}
                  </span>
                </div>
              </foreignObject>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
