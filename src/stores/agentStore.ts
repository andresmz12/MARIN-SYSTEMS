import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { AgentHealthData, HealthStatus } from '@/types/agents';

export interface AgentStoreState {
  agents: Record<string, AgentHealthData>;
  isPolling: boolean;
  lastGlobalRefresh: Date | null;

  // Actions
  updateAgent: (id: string, data: Partial<AgentHealthData>) => void;
  setPolling: (v: boolean) => void;
  setLastRefresh: (date: Date) => void;
  initializeAgents: (agents: Array<{ id: string; name: string }>) => void;
}

export const useAgentStore = create<AgentStoreState>()(
  subscribeWithSelector((set) => ({
    agents: {},
    isPolling: false,
    lastGlobalRefresh: null,

    updateAgent: (id: string, data: Partial<AgentHealthData>) =>
      set((state) => ({
        agents: {
          ...state.agents,
          [id]: {
            ...state.agents[id],
            ...data,
          },
        },
      })),

    setPolling: (v: boolean) => set({ isPolling: v }),

    setLastRefresh: (date: Date) => set({ lastGlobalRefresh: date }),

    initializeAgents: (agents: Array<{ id: string; name: string }>) =>
      set({
        agents: agents.reduce(
          (acc, app) => ({
            ...acc,
            [app.id]: {
              status: 'unknown' as HealthStatus,
              latency: null,
              uptime: null,
              lastChecked: new Date(),
              lastStatusChange: new Date(),
              consecutiveFailures: 0,
              message: null,
            },
          }),
          {}
        ),
      }),
  }))
);
