'use client'

import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

interface SparklinePoint {
  x: string | number
  y: number
}

interface SparklineProps {
  data: SparklinePoint[]
  color: string
  height?: number
  valueSuffix?: string
}

export function Sparkline({ data, color, height = 44, valueSuffix = '' }: SparklineProps) {
  const gradId = `spark-${color.replace('#', '')}`
  const hasData = data.length > 1 && data.some((d) => d.y !== 0)

  if (!hasData) {
    return (
      <div style={{ height }} className="flex items-center">
        <div className="w-full h-px bg-[#2a2a2a]" />
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.3 }}
          contentStyle={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px',
            fontSize: '11px', padding: '4px 8px',
          }}
          labelFormatter={(label) => `${label}`}
          formatter={(value: number) => [`${value}${valueSuffix}`, '']}
        />
        <Area
          type="monotone"
          dataKey="y"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          fill={`url(#${gradId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
