'use client';

import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/stores/agentStore';

const HISTORY_POLL_INTERVAL = 60000; // 60 segundos
const HISTORY_HOURS = 6;

export function useAgentHistoryPolling() {
  const setAllHistory = useAgentStore((state) => state.setAllHistory);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const poll = async () => {
    try {
      const response = await fetch(`/api/agents/history?hours=${HISTORY_HOURS}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return;

      const data = await response.json();
      if (data.apps && Array.isArray(data.apps)) {
        setAllHistory(data.apps);
      }
    } catch (error) {
      console.error('History polling error:', error);
    }
  };

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, HISTORY_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
