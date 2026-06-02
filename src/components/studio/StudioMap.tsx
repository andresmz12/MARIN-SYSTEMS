'use client'

import { useEffect, useRef, useState } from 'react'

interface Child {
  id: string
  texto: string
  color: string
}

interface Branch {
  id: string
  emoji: string
  texto: string
  color: string
  hijos: Child[]
}

interface MapaJson {
  centro: { id: string; emoji: string; texto: string; color: string }
  ramas: Branch[]
}

interface Props {
  mapaJson: MapaJson
}

const FONT = "'Caveat', cursive"

function polarToXY(cx: number, cy: number, angle: number, r: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  }
}

export default function StudioMap({ mapaJson }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ w: Math.max(width, 320), h: Math.max(height, 240) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const { centro, ramas } = mapaJson
  const cx = size.w / 2
  const cy = size.h / 2
  const branchCount = ramas.length
  const branchR = Math.min(size.w, size.h) * 0.28
  const childR = Math.min(size.w, size.h) * 0.44

  const angleStep = (2 * Math.PI) / branchCount
  const startAngle = -Math.PI / 2

  const centerR = Math.min(size.w, size.h) * 0.1

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        width={size.w}
        height={size.h}
        style={{ position: 'absolute', inset: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.08)" />
          </pattern>
        </defs>
        <rect width={size.w} height={size.h} fill="#1a1a2e" />
        <rect width={size.w} height={size.h} fill="url(#dots)" />

        {ramas.map((branch, i) => {
          const angle = startAngle + i * angleStep
          const bPos = polarToXY(cx, cy, angle, branchR)

          return (
            <g key={branch.id}>
              {/* center → branch line */}
              <line
                x1={cx} y1={cy}
                x2={bPos.x} y2={bPos.y}
                stroke={branch.color}
                strokeWidth="2.5"
                strokeOpacity="0.6"
              />

              {branch.hijos?.map((child, j) => {
                const spread = (branchCount <= 4 ? 0.35 : 0.28)
                const childAngle = angle + (j - (branch.hijos.length - 1) / 2) * spread
                const cPos = polarToXY(cx, cy, childAngle, childR)

                return (
                  <g key={child.id}>
                    <line
                      x1={bPos.x} y1={bPos.y}
                      x2={cPos.x} y2={cPos.y}
                      stroke={child.color}
                      strokeWidth="1.5"
                      strokeOpacity="0.5"
                    />
                    <rect
                      x={cPos.x - 52} y={cPos.y - 16}
                      width={104} height={32}
                      rx="8"
                      fill={child.color}
                      fillOpacity="0.18"
                      stroke={child.color}
                      strokeWidth="1"
                      strokeOpacity="0.4"
                    />
                    <text
                      x={cPos.x} y={cPos.y + 5}
                      textAnchor="middle"
                      fill="white"
                      fontSize={Math.min(size.w, size.h) * 0.026}
                      fontFamily={FONT}
                      opacity="0.9"
                    >
                      {child.texto}
                    </text>
                  </g>
                )
              })}

              {/* branch node */}
              <circle
                cx={bPos.x} cy={bPos.y}
                r={Math.min(size.w, size.h) * 0.065}
                fill={branch.color}
                fillOpacity="0.85"
              />
              <text
                x={bPos.x} y={bPos.y - 8}
                textAnchor="middle"
                fontSize={Math.min(size.w, size.h) * 0.036}
                fontFamily={FONT}
              >
                {branch.emoji}
              </text>
              <text
                x={bPos.x} y={bPos.y + 14}
                textAnchor="middle"
                fill="white"
                fontSize={Math.min(size.w, size.h) * 0.028}
                fontFamily={FONT}
                fontWeight="600"
              >
                {branch.texto}
              </text>
            </g>
          )
        })}

        {/* center node */}
        <circle
          cx={cx} cy={cy}
          r={centerR}
          fill={centro.color}
        />
        <text
          x={cx} y={cy - 10}
          textAnchor="middle"
          fontSize={Math.min(size.w, size.h) * 0.04}
          fontFamily={FONT}
        >
          {centro.emoji}
        </text>
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fill="white"
          fontSize={Math.min(size.w, size.h) * 0.032}
          fontFamily={FONT}
          fontWeight="700"
        >
          {centro.texto}
        </text>
      </svg>
    </div>
  )
}
