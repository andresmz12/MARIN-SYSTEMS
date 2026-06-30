'use client';

import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { HealthStatus } from '@/types/agents';

const POLL_INTERVAL = 30000; // 30 segundos

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
        data.apps.forEach(
          (app: {
            id: string;
            status: HealthStatus;
            latency: number | null;
            uptime: number | null;
          }) => {
            updateAgent(app.id, {
              status: app.status,
              latency: app.latency,
              uptime: app.uptime,
              lastChecked: new Date(),
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
