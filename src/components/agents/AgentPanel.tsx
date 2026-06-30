'use client';

import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { AgentCharacter } from '@/pixi/agents/AgentCharacter';
import { AgentAnimationController } from '@/pixi/agents/AgentAnimationController';
import { useAgentStore } from '@/stores/agentStore';
import { HealthStatus } from '@/types/agents';

interface AgentPanelProps {
  id: string;
  name: string;
  color: string;
}

export function AgentPanel({ id, name, color }: AgentPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const characterRef = useRef<AgentCharacter | null>(null);
  const controllerRef = useRef<AgentAnimationController | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const agentData = useAgentStore((state) => state.agents[id]);
  const status = (agentData?.status || 'unknown') as HealthStatus;
  const latency = agentData?.latency;
  const uptime = agentData?.uptime;

  // Inicializar PixiJS
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return;

    const initPixi = async () => {
      try {
        const app = new PIXI.Application();
        await app.init({
          canvas: canvasRef.current!,
          width: 200,
          height: 280,
          backgroundColor: 0x0a0e17,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });

        appRef.current = app;

        // Crear personaje
        const character = new AgentCharacter(name, color);
        character.position.set(100, 140);
        app.stage.addChild(character);
        characterRef.current = character;

        // Crear controller (comparte el ticker de la app)
        const controller = new AgentAnimationController(character, app.ticker);
        controllerRef.current = controller;

        cleanupRef.current = () => {
          controller.destroy();
          app.destroy(true);
        };
      } catch (error) {
        console.error('Error initializing PixiJS:', error);
      }
    };

    initPixi();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
        appRef.current = null;
        characterRef.current = null;
        controllerRef.current = null;
      }
    };
  }, [name, color]);

  // Actualizar estado de animación cuando cambia el health
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setState(status);
    }
  }, [status]);

  const statusColor =
    status === 'healthy'
      ? '#22C55E'
      : status === 'degraded'
        ? '#EAB308'
        : status === 'down'
          ? '#EF4444'
          : '#6B7280';

  return (
    <div className="flex flex-col rounded-lg bg-slate-900 border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors">
      {/* Canvas */}
      <div className="flex justify-center bg-slate-950 p-3">
        <canvas
          ref={canvasRef}
          className="rounded"
          style={{
            width: '200px',
            height: '280px',
            imageRendering: 'pixelated',
          }}
        />
      </div>

      {/* Stats */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <h3 className="font-semibold text-white text-sm truncate">{name}</h3>

        {/* Status */}
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-xs text-slate-300 uppercase tracking-wider font-medium">
            {status === 'unknown' ? 'Checking...' : status}
          </span>
        </div>

        {/* Metrics */}
        <div className="text-xs text-slate-400 space-y-1.5 flex-1">
          {latency !== null && latency !== undefined ? (
            <div className="flex justify-between">
              <span>Latency</span>
              <span className="font-mono text-slate-200">{latency}ms</span>
            </div>
          ) : null}
          {uptime !== null && uptime !== undefined ? (
            <div className="flex justify-between">
              <span>Uptime</span>
              <span className="font-mono text-slate-200">{uptime.toFixed(1)}%</span>
            </div>
          ) : null}
          {(latency === null || latency === undefined) &&
            (uptime === null || uptime === undefined) && (
              <div className="text-slate-500">No data</div>
            )}
        </div>
      </div>
    </div>
  );
}
