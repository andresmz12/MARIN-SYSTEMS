'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { HealthStatus } from '@/types/agents';

const POLL_INTERVAL = 300000; // 5 minutos
// Short debounce to avoid double-fetch on React strict-mode double-invoke,
// but short enough that navigating away and back always gets fresh data.
const INITIAL_FETCH_DEBOUNCE_MS = 10_000; // 10 segundos

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
      cache: 'no-store',
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
          const statusChanged =
            prevStatus !== undefined && prevStatus !== 'unknown' && prevStatus !== app.status;
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
            ...(statusChanged ? { lastStatusChange: now } : {}),
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
    // Fetch immediately unless we just fetched (debounce for React strict-mode double-invoke).
    // 10s is short enough that re-navigating to /agentes always gets fresh data.
    const shouldFetch = lastFetchedAt === null || Date.now() - lastFetchedAt >= INITIAL_FETCH_DEBOUNCE_MS;
    if (shouldFetch) {
      poll();
    }

    // Start the global interval only once — never cleared on unmount.
    if (globalInterval === null) {
      globalInterval = setInterval(poll, POLL_INTERVAL);
    }
  }, []);
}
