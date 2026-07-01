'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { HealthStatus } from '@/types/agents';

const POLL_INTERVAL = 300000; // 5 minutos

// Module-level state: survives component unmount/remount within the same JS session.
// On hard refresh (F5) the JS module reinitializes, so a new fetch is always made then.
let globalInterval: ReturnType<typeof setInterval> | null = null;
let lastFetchedAt: number | null = null;

async function poll() {
  const { updateAgent, setPolling, setLastRefresh } = useAgentStore.getState();

  try {
    setPolling(true);
    const response = await fetch('/api/agents/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error('Health check failed:', response.status);
      setPolling(false);
      return;
    }

    const data = await response.json();

    if (data.apps && Array.isArray(data.apps)) {
      const currentAgents = useAgentStore.getState().agents;
      const now = new Date();

      data.apps.forEach(
        (app: {
          id: string;
          status: HealthStatus;
          latency: number | null;
          uptime: number | null;
          errorRate: number | null;
          consecutiveFailures: number;
          databaseConnected: boolean;
          memoryUsage: number | null;
          cpuUsage: number | null;
        }) => {
          const prevStatus = currentAgents[app.id]?.status;
          const isFirstRealStatus = prevStatus === undefined || prevStatus === 'unknown';
          const statusChanged = !isFirstRealStatus && prevStatus !== app.status;
          updateAgent(app.id, {
            status: app.status,
            latency: app.latency,
            uptime: app.uptime,
            errorRate: app.errorRate,
            consecutiveFailures: app.consecutiveFailures,
            databaseConnected: app.databaseConnected,
            memoryUsage: app.memoryUsage,
            cpuUsage: app.cpuUsage,
            lastChecked: now,
            ...(statusChanged || isFirstRealStatus ? { lastStatusChange: now } : {}),
          });
        }
      );
    }

    lastFetchedAt = Date.now();
    setLastRefresh(new Date());
    setPolling(false);
  } catch (error) {
    console.error('Polling error:', error);
    setPolling(false);
  }
}

export function useAgentPolling() {
  useEffect(() => {
    // Only fetch if never fetched, or the full interval has elapsed since last fetch.
    const shouldFetch = lastFetchedAt === null || Date.now() - lastFetchedAt >= POLL_INTERVAL;
    if (shouldFetch) {
      poll();
    }

    // Start the global interval only once — never cleared on unmount.
    if (globalInterval === null) {
      globalInterval = setInterval(poll, POLL_INTERVAL);
    }
  }, []);
}
