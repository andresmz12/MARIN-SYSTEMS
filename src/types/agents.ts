// Estados de salud posibles
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

// Datos de salud de una app (lo que devuelve /api/health)
export interface AgentHealthData {
  status: HealthStatus;
  latency: number | null;        // ms
  uptime: number | null;         // %
  lastChecked: Date;
  lastStatusChange: Date;
  consecutiveFailures: number;
  message: string | null;
}

// Una app registrada en Prisma
export interface MonitoredApp {
  id: string;
  name: string;
  agentName: string;
  role: string | null;
  healthUrl: string;
  color: string;
  createdAt: Date;
}

// Estado de animación interno
export interface AnimationFrameData {
  bodyOffsetY: number;           // breathing
  armLeftOffsetY: number;
  armLeftAngle: number;
  armRightOffsetY: number;
  armRightAngle: number;
  eyeScaleY: number;             // blink
  characterOffsetX: number;      // shake
  glowAlpha: number;
  glowScale: number;
  glowColor: string;
  headAngle: number;             // slump
}

export type AnimationState = 'idle' | 'typing' | 'degraded' | 'down' | 'recovering';
