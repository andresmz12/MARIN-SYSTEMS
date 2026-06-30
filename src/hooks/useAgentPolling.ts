'use client';

import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { HealthStatus } from '@/types/agents';

const POLL_INTERVAL = 300000; // 5 minutos

export function useAgentPolling() {
  const updateAgent = useAgentStore((state) => state.updateAgent);
  const setPolling = useAgentStore((state) => state.setPolling);
  const setLastRefresh = useAgentStore((state) => state.setLastRefresh);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const poll = async () => {
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

      setLastRefresh(new Date());
      setPolling(false);
    } catch (error) {
      console.error('Polling error:', error);
      setPolling(false);
    }
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
