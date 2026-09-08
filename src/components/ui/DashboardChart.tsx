'use client'

import {
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PolarAngleAxis,
} from 'recharts'

interface Point { x: string; y: number }

const AXIS_STYLE = { fontSize: 10, fill: '#6b7280' }
const GRID_COLOR = 'rgba(255,255,255,0.06)'

function ChartTooltip({ active, payload, label, suffix }: { active?: boolean; payload?: { value: number }[]; label?: string; suffix?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--bg-border)] bg-[#0b0d12]/95 backdrop-blur-sm px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-slate-500">{label}</p>
      <p className="font-display font-semibold text-white">{payload[0].value}{suffix}</p>
    </div>
  )
}

/** Continuous magnitude over time (equity curve) — thin 2px line + gradient fill under it. */
export function DashboardAreaChart({ data, color, suffix = '', height = 150 }: { data: Point[]; color: string; suffix?: string; height?: number }) {
  const gradientId = `area-grad-${color.replace('#', '')}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="x" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={34} />
        <Tooltip content={<ChartTooltip suffix={suffix} />} cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.3 }} />
        <Area type="monotone" dataKey="y" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 4, fill: color, stroke: '#0b0d12', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Discrete daily counts — bars with rounded data-ends, not a line, since each day is its own value. */
export function DashboardBarChart({ data, color, height = 150 }: { data: Point[]; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="x" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: color, fillOpacity: 0.08 }} />
        <Bar dataKey="y" fill={color} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Single-value gauge (win rate, % complete) — a radial progress ring reads faster than a bare number. */
export function DashboardGauge({ value, color, size = 96, label }: { value: number; color: string; size?: number; label?: string }) {
  const data = [{ value: Math.max(0, Math.min(100, value)) }]
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={90}
          endAngle={-270}
          innerRadius="72%"
          outerRadius="100%"
          barSize={8}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" fill={color} cornerRadius={4} background={{ fill: 'rgba(255,255,255,0.06)' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold text-white leading-none">{Math.round(value)}%</span>
        {label && <span className="text-[9px] text-slate-500 mt-0.5">{label}</span>}
      </div>
    </div>
  )
}
