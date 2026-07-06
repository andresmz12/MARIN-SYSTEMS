'use client';

import { motion } from 'framer-motion';
import { MonitoredApp } from '@/types/agents';
import { AgentCharacter } from './AgentCharacter';

interface AgentOfficeProps {
  apps: MonitoredApp[];
}

// ─── Ambient office decor (purely cosmetic) ──────────────────
function OfficeDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Window with sky */}
      <div className="absolute top-6 left-6 w-40 h-24 rounded-md border-4 border-slate-700/70 bg-gradient-to-b from-sky-400/30 to-indigo-500/20 shadow-inner">
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="border-r border-b border-slate-700/60" />
          <div className="border-b border-slate-700/60" />
          <div className="border-r border-slate-700/60" />
          <div />
        </div>
        {/* sun */}
        <motion.div
          className="absolute right-3 top-3 w-5 h-5 rounded-full bg-yellow-300/80 blur-[1px]"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Wall clock */}
      <div className="absolute top-8 right-10 w-12 h-12 rounded-full border-4 border-slate-700/70 bg-slate-800/80 flex items-center justify-center">
        <div className="relative w-full h-full">
          <div className="absolute left-1/2 top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-full bg-slate-300 origin-bottom" />
          <div className="absolute left-1/2 top-1/2 h-2 w-[2px] -translate-x-1/2 -translate-y-full bg-slate-400 origin-bottom rotate-90" />
          <div className="absolute left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-200" />
        </div>
      </div>

      {/* Framed picture */}
      <div className="absolute top-10 right-28 w-16 h-12 rounded-sm border-4 border-slate-700/70 bg-gradient-to-br from-emerald-500/30 to-teal-400/20" />

      {/* Potted plant, bottom-left corner */}
      <div className="absolute bottom-4 left-4 text-4xl select-none">🪴</div>
      {/* Water cooler, bottom-right corner */}
      <div className="absolute bottom-4 right-6 text-4xl select-none">🌡️</div>
    </div>
  );
}

export function AgentOffice({ apps }: AgentOfficeProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-700/70">
      {/* Room: wall (top) + floor (bottom) */}
      <div className="absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-slate-800 to-slate-800/70" />
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-slate-700/60 to-slate-900" />
        {/* baseboard / horizon line */}
        <div className="absolute inset-x-0 top-[62%] h-[2px] bg-slate-600/50" />
      </div>

      <OfficeDecor />

      {/* Desks */}
      <div className="relative z-10 px-6 pt-28 pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8 justify-items-center">
          {apps.map((app) => (
            <AgentCharacter
              key={app.id}
              id={app.id}
              name={app.name}
              agentName={app.agentName}
              role={app.role}
              color={app.color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
