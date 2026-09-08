'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AnimationState, HealthStatus } from '@/types/agents';
import { useAgentStore } from '@/stores/agentStore';
import { AgentDetailsModal } from './AgentDetailsModal';

interface AgentCharacterProps {
  id: string;
  name: string;
  agentName: string;
  role: string | null;
  color: string;
}

// ─── Status → animation + palette ────────────────────────────
const STATUS_COLOR: Record<HealthStatus, string> = {
  healthy: '#22c55e',
  degraded: '#eab308',
  down: '#ef4444',
  unknown: '#64748b',
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Trabajando',
  degraded: 'Con problemas',
  down: 'Caído',
  unknown: 'Conectando…',
};

function toAnimState(status: HealthStatus): AnimationState {
  switch (status) {
    case 'healthy': return 'typing';
    case 'degraded': return 'degraded';
    case 'down': return 'down';
    default: return 'idle';
  }
}

// ─── Per-agent look, derived deterministically from the id ───
const SKIN_TONES = ['#f2c9a3', '#e8b088', '#cd9366', '#a56a44'];
const HAIR_COLORS = ['#2b2b2b', '#4a2f1b', '#6b4423', '#1f1f1f', '#5c4033'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h;
}

// Known female agent names + a Spanish heuristic (names ending in "a"), with the
// common male exceptions excluded — so Ángela/Luisa get long hair, Alejandro doesn't.
const FEMALE_NAMES = new Set([
  'angela', 'luisa', 'ana', 'maria', 'sofia', 'laura', 'valentina', 'camila',
  'daniela', 'carolina', 'paula', 'andrea', 'gabriela', 'juliana', 'natalia',
  'isabella', 'mariana', 'lucia', 'elena', 'clara', 'angie',
]);
const MALE_ENDS_IN_A = new Set(['joshua', 'elias', 'lucas', 'jonas', 'noa']);

function isFeminineName(name: string): boolean {
  const n = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const first = n.split(/\s+/)[0] ?? '';
  if (FEMALE_NAMES.has(first)) return true;
  if (MALE_ENDS_IN_A.has(first)) return false;
  return first.endsWith('a');
}

// ─── Floating status bubble (only when something's wrong) ────
function StatusBubble({ state }: { state: AnimationState }) {
  if (state !== 'down' && state !== 'degraded') return null;
  const emoji = state === 'down' ? '😴' : '😰';
  return (
    <motion.text
      x={146}
      y={38}
      fontSize={22}
      textAnchor="middle"
      animate={{ y: [38, 30, 38] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    >
      {emoji}
    </motion.text>
  );
}

export function AgentCharacter({ id, name, agentName, role, color }: AgentCharacterProps) {
  const agentData = useAgentStore((s) => s.agents[id]);
  const status = (agentData?.status ?? 'unknown') as HealthStatus;
  const [showDetails, setShowDetails] = useState(false);

  const state = toAnimState(status);
  const isDown = state === 'down';
  const isDegraded = state === 'degraded';
  const isTyping = state === 'typing';

  const statusColor = STATUS_COLOR[status];

  const seed = hashString(id + agentName);
  const skin = SKIN_TONES[seed % SKIN_TONES.length];
  const hair = HAIR_COLORS[(seed >> 3) % HAIR_COLORS.length];
  const feminine = isFeminineName(agentName);

  const mouthPath = isDown
    ? 'M94 71 Q100 68 106 71'          // small frown
    : isDegraded
      ? 'M93 71 H107'                   // flat
      : 'M92 69 Q100 76 108 69';        // smile

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setShowDetails(true)}
        aria-label={`Ver detalles de ${agentName}`}
        className="group relative w-full max-w-[220px] focus:outline-none"
      >
        <svg viewBox="0 0 200 200" className="w-full drop-shadow-sm">
          {/* Status glow behind the character */}
          <motion.ellipse
            cx={100}
            cy={104}
            rx={78}
            ry={66}
            fill={statusColor}
            style={{ filter: 'blur(12px)' }}
            animate={{
              opacity: isDown ? [0.35, 0.6, 0.35] : [0.18, 0.34, 0.18],
              scale: [1, 1.06, 1],
            }}
            transition={{ duration: isDown ? 1 : 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Floor shadow */}
          <ellipse cx={100} cy={182} rx={62} ry={9} fill="#000000" opacity={0.22} />

          {/* Chair back */}
          <rect x={60} y={60} width={80} height={86} rx={18} fill="#1f2937" />
          <rect x={68} y={68} width={64} height={70} rx={14} fill="#273244" />

          {/* ── Upper body (breathing) ──────────────────────── */}
          <motion.g
            animate={isDown ? { y: 9 } : { y: [0, -2.5, 0] }}
            transition={
              isDown
                ? { duration: 0.5 }
                : { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }
            }
          >
            {/* Torso / shirt (agent brand color) */}
            <rect x={64} y={96} width={72} height={70} rx={22} fill={color} />
            {/* Collar */}
            <path d="M88 98 L100 112 L112 98 Z" fill="#ffffff" opacity={0.18} />

            {/* Arms (sleeves) */}
            <line x1={72} y1={106} x2={88} y2={150} stroke={color} strokeWidth={15} strokeLinecap="round" />
            <line x1={128} y1={106} x2={112} y2={150} stroke={color} strokeWidth={15} strokeLinecap="round" />

            {/* Hands (typing) */}
            <motion.circle
              cx={88}
              cy={150}
              r={8}
              fill={skin}
              animate={isTyping ? { y: [0, -4, 0] } : isDegraded ? { y: [0, -2.5, 0] } : { y: 0 }}
              transition={
                isTyping
                  ? { duration: 0.26, repeat: Infinity, ease: 'easeInOut' }
                  : isDegraded
                    ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 0.3 }
              }
            />
            <motion.circle
              cx={112}
              cy={150}
              r={8}
              fill={skin}
              animate={isTyping ? { y: [0, -4, 0] } : isDegraded ? { y: [0, -2.5, 0] } : { y: 0 }}
              transition={
                isTyping
                  ? { duration: 0.26, repeat: Infinity, ease: 'easeInOut', delay: 0.13 }
                  : isDegraded
                    ? { duration: 0.55, repeat: Infinity, ease: 'easeInOut', delay: 0.27 }
                    : { duration: 0.3 }
              }
            />

            {/* Neck */}
            <rect x={91} y={80} width={18} height={20} rx={6} fill={skin} />

            {/* ── Head (slumps when down) ─────────────────── */}
            <motion.g
              style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
              animate={
                isDown
                  ? { rotate: 20, y: 15 }
                  : isDegraded
                    ? { rotate: [0, -3, 0, 3, 0] }
                    : { rotate: [0, -1.5, 0] }
              }
              transition={
                isDown
                  ? { duration: 0.6 }
                  : isDegraded
                    ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
                    : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {/* Long hair (feminine names) — drawn behind the head so it falls to the shoulders */}
              {feminine && (
                <path
                  d="M70 52 Q58 96 74 112 Q78 92 76 74 Q74 64 80 56 L120 56 Q126 64 124 74 Q122 92 126 112 Q142 96 130 52 Q126 30 100 30 Q74 30 70 52 Z"
                  fill={hair}
                />
              )}
              <circle cx={100} cy={58} r={27} fill={skin} />
              {/* Ears */}
              <circle cx={73} cy={60} r={5} fill={skin} />
              <circle cx={127} cy={60} r={5} fill={skin} />
              {/* Hair */}
              {feminine ? (
                // Fuller top + side bangs framing the face
                <path d="M72 58 Q72 28 100 28 Q128 28 128 58 Q120 46 108 45 Q104 40 100 40 Q96 40 92 45 Q80 46 72 58 Z" fill={hair} />
              ) : (
                <path d="M74 56 Q78 29 100 29 Q122 29 126 56 Q108 44 100 44 Q92 44 74 56 Z" fill={hair} />
              )}
              {/* Eyes (blink) */}
              <motion.g
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                animate={isDown ? { scaleY: 0.12 } : { scaleY: [1, 1, 0.12, 1] }}
                transition={
                  isDown
                    ? { duration: 0.3 }
                    : { duration: 4.5, repeat: Infinity, times: [0, 0.92, 0.96, 1] }
                }
              >
                <ellipse cx={90} cy={58} rx={3.2} ry={4.6} fill="#1e293b" />
                <ellipse cx={110} cy={58} rx={3.2} ry={4.6} fill="#1e293b" />
              </motion.g>
              {/* Eyebrows — angle down when stressed */}
              {isDegraded || isDown ? (
                <>
                  <line x1={84} y1={49} x2={95} y2={52} stroke="#1e293b" strokeWidth={2} strokeLinecap="round" />
                  <line x1={116} y1={49} x2={105} y2={52} stroke="#1e293b" strokeWidth={2} strokeLinecap="round" />
                </>
              ) : null}
              {/* Mouth */}
              <path d={mouthPath} stroke="#1e293b" strokeWidth={2} fill="none" strokeLinecap="round" />
            </motion.g>
          </motion.g>

          {/* ── Desk (foreground) ───────────────────────────── */}
          <rect x={18} y={152} width={164} height={13} rx={3} fill="#3b4657" />
          <rect x={18} y={152} width={164} height={3} rx={1.5} fill="#4b5a70" />

          {/* Keyboard */}
          <rect x={80} y={149} width={40} height={8} rx={2} fill="#cbd5e1" />
          <rect x={83} y={151} width={34} height={1.4} fill="#94a3b8" />

          {/* Monitor (screen reflects status color) */}
          <rect x={148} y={140} width={6} height={14} fill="#475569" />
          <rect x={142} y={153} width={18} height={3} rx={1} fill="#475569" />
          <rect x={128} y={106} width={46} height={36} rx={4} fill="#0f172a" />
          <motion.rect
            x={132}
            y={110}
            width={38}
            height={28}
            rx={2}
            fill={statusColor}
            animate={isDown ? { opacity: 0.25 } : { opacity: [0.65, 1, 0.65] }}
            transition={
              isDown
                ? { duration: 0.5 }
                : { duration: isDegraded ? 1.6 : 0.9, repeat: Infinity, ease: 'easeInOut' }
            }
          />
          <rect x={136} y={115} width={20} height={2.4} rx={1} fill="#ffffff" opacity={0.5} />
          <rect x={136} y={121} width={28} height={2.4} rx={1} fill="#ffffff" opacity={0.35} />
          <rect x={136} y={127} width={14} height={2.4} rx={1} fill="#ffffff" opacity={0.35} />

          <StatusBubble state={state} />
        </svg>

        {/* Hover ring */}
        <span className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-slate-500/0 group-hover:ring-2 group-hover:ring-slate-500/40 transition" />
      </button>

      {/* Nameplate */}
      <div className="mt-1 flex flex-col items-center text-center">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-sm font-semibold text-white">{agentName}</span>
        </div>
        <span className="text-[11px] text-slate-400 leading-tight">{role ?? name}</span>
        <span className="text-[10px] font-medium mt-0.5" style={{ color: statusColor }}>
          {STATUS_LABEL[status]}
        </span>
        {(agentData?.latency != null || agentData?.uptime != null) && (
          <span className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
            {agentData?.latency != null && <span>{agentData.latency}ms</span>}
            {agentData?.latency != null && agentData?.uptime != null && <span>·</span>}
            {agentData?.uptime != null && <span>{agentData.uptime.toFixed(0)}% uptime</span>}
          </span>
        )}
      </div>

      {showDetails && (
        <AgentDetailsModal
          id={id}
          name={name}
          agentName={agentName}
          role={role}
          color={color}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}
