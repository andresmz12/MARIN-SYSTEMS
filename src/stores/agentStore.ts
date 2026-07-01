import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { AgentHealthData, AgentHistoryData, HealthStatus } from '@/types/agents';

export interface AgentStoreState {
  agents: Record<string, AgentHealthData>;
  history: Record<string, AgentHistoryData>;
  isPolling: boolean;
  lastGlobalRefresh: Date | null;

  // Actions
  updateAgent: (id: string, data: Partial<AgentHealthData>) => void;
  setPolling: (v: boolean) => void;
  setLastRefresh: (date: Date) => void;
  initializeAgents: (agents: Array<{ id: string; name: string }>) => void;
  setAllHistory: (entries: Array<{ appId: string } & AgentHistoryData>) => void;
}

export const useAgentStore = create<AgentStoreState>()(
  subscribeWithSelector((set) => ({
    agents: {},
    history: {},
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
      set((state) => ({
        agents: agents.reduce(
          (acc, app) => ({
            ...acc,
            [app.id]: state.agents[app.id] ?? {
              status: 'unknown' as HealthStatus,
              latency: null,
              uptime: null,
              lastChecked: new Date(),
              lastStatusChange: null,
              consecutiveFailures: 0,
              message: null,
              errorRate: null,
              databaseConnected: true,
              memoryUsage: null,
              cpuUsage: null,
            },
          }),
          {}
        ),
      })),

    setAllHistory: (entries: Array<{ appId: string } & AgentHistoryData>) =>
      set((state) => ({
        history: entries.reduce(
          (acc, { appId, ...data }) => ({ ...acc, [appId]: data }),
          { ...state.history }
        ),
      })),
  }))
);
