// Estados de salud posibles
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

// Datos de salud de una app (lo que devuelve /api/health)
export interface AgentHealthData {
  status: HealthStatus;
  latency: number | null;        // ms
  uptime: number | null;         // %
  lastChecked: Date;
  lastStatusChange: Date | null;
  consecutiveFailures: number;
  message: string | null;
  errorRate: number | null;      // %
  databaseConnected: boolean;
  memoryUsage: number | null;    // %
  cpuUsage: number | null;       // %
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

// Punto histórico de un health check (tabla AgentHealthLog)
export interface AgentHistoryPoint {
  checkedAt: string;
  status: HealthStatus;
  latency: number | null;
  uptime: number | null;
  errorRate: number | null;
  memoryUsage: number | null;
  cpuUsage: number | null;
  databaseConnected: boolean | null;
}

// Transición de estado detectada entre dos puntos consecutivos
export interface AgentTransition {
  checkedAt: string;
  from: HealthStatus;
  to: HealthStatus;
}

export type LatencyTrend = 'up' | 'down' | 'stable';

export interface AgentHistoryStats {
  changesToday: number;
  peakLatencyToday: number | null;
  lastFailureAt: string | null;
  trend: LatencyTrend;
}

export interface AgentHistoryData {
  points: AgentHistoryPoint[];
  stats: AgentHistoryStats;
  transitions?: AgentTransition[];
}
