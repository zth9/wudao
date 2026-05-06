import { create } from "zustand";
import { persist } from "zustand/middleware";
import { providers as api, runnerConfig as runnerConfigApi, usageTrackers as trackerApi, type Provider, type RunnerConfig, type UsageTracker } from "../services/api";
import type { SortOption } from "../components/task-panel/constants";

export type Theme = 'light' | 'dark' | 'system';

export interface UserProfile {
  nickname: string;
  avatar: string;
}

export interface AssistantProfile {
  avatar: string;
}

interface SettingsState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  user: UserProfile;
  setUser: (user: Partial<UserProfile>) => void;
  assistant: AssistantProfile;
  setAssistant: (assistant: Partial<AssistantProfile>) => void;
  taskSortBy: SortOption;
  setTaskSortBy: (sort: SortOption) => void;
  taskSortOrder: "asc" | "desc";
  setTaskSortOrder: (order: "asc" | "desc") => void;
  providers: Provider[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  fetch: () => Promise<boolean>;
  add: (data: Omit<Provider, "id" | "created_at" | "sort_order">) => Promise<boolean>;
  update: (id: string, data: Partial<Provider>) => Promise<boolean>;
  reorder: (ids: string[]) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  runnerConfig: RunnerConfig | null;
  runnerConfigLoading: boolean;
  fetchRunnerConfig: () => Promise<boolean>;
  updateRunnerConfig: (data: Partial<RunnerConfig>) => Promise<boolean>;
  usageTrackers: UsageTracker[];
  trackerLoading: boolean;
  trackerError: string | null;
  clearTrackerError: () => void;
  fetchTrackers: () => Promise<boolean>;
  addTracker: (data: Omit<UsageTracker, "id" | "created_at" | "sort_order">) => Promise<boolean>;
  updateTracker: (id: string, data: Partial<UsageTracker>) => Promise<boolean>;
  reorderTrackers: (ids: string[]) => Promise<boolean>;
  removeTracker: (id: string) => Promise<boolean>;
  assistantSystemPrompt: string;
  assistantSystemPromptLoading: boolean;
  assistantSystemPromptSaving: boolean;
  fetchAssistantSystemPrompt: () => Promise<boolean>;
  saveAssistantSystemPrompt: (content: string) => Promise<boolean>;
}

function resolveSettingsError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const jsonStart = error.message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { error?: string; detail?: string };
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return parsed.error.trim();
      }
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail.trim();
      }
    } catch {
      // Fall through to the raw message when the response body is not valid JSON.
    }
  }

  return error.message || fallback;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      user: {
        nickname: "",
        avatar: "",
      },
      setUser: (user) => set((state) => ({ user: { ...state.user, ...user } })),
      assistant: {
        avatar: "",
      },
      setAssistant: (assistant) => set((state) => ({ assistant: { ...state.assistant, ...assistant } })),
      taskSortBy: "updated_at",
      setTaskSortBy: (taskSortBy) => set({ taskSortBy }),
      taskSortOrder: "desc",
      setTaskSortOrder: (taskSortOrder) => set({ taskSortOrder }),
      providers: [],
      loading: false,
      error: null,
      clearError: () => set({ error: null }),

      fetch: async () => {
        set({ loading: true, error: null });
        try {
          const providers = await api.list();
          set({ providers, loading: false, error: null });
          return true;
        } catch (error) {
          set({
            loading: false,
            error: resolveSettingsError(error, "Failed to load providers"),
          });
          return false;
        }
      },

      add: async (data) => {
        set({ error: null });
        try {
          await api.create(data);
          const providers = await api.list();
          set({ providers, error: null });
          return true;
        } catch (error) {
          set({ error: resolveSettingsError(error, "Failed to save provider") });
          return false;
        }
      },

      update: async (id, data) => {
        set({ error: null });
        try {
          await api.update(id, data);
          const providers = await api.list();
          set({ providers, error: null });
          return true;
        } catch (error) {
          set({ error: resolveSettingsError(error, "Failed to save provider") });
          return false;
        }
      },

      reorder: async (ids) => {
        const prev = get().providers;
        const reordered = ids.map((id) => prev.find((p) => p.id === id)!).filter(Boolean);
        set({ providers: reordered, error: null });
        try {
          const providers = await api.reorder(ids);
          set({ providers, error: null });
          return true;
        } catch (error) {
          set({ providers: prev, error: resolveSettingsError(error, "Failed to reorder providers") });
          return false;
        }
      },

      remove: async (id) => {
        set({ error: null });
        try {
          await api.delete(id);
          return await get().fetch();
        } catch (error) {
          set({ error: resolveSettingsError(error, "Failed to delete provider") });
          return false;
        }
      },

      runnerConfig: null,
      runnerConfigLoading: false,

      fetchRunnerConfig: async () => {
        set({ runnerConfigLoading: true });
        try {
          const config = await runnerConfigApi.get();
          set({ runnerConfig: config, runnerConfigLoading: false });
          return true;
        } catch {
          set({ runnerConfigLoading: false });
          return false;
        }
      },

      updateRunnerConfig: async (data) => {
        try {
          const config = await runnerConfigApi.update(data);
          set({ runnerConfig: config });
          return true;
        } catch {
          return false;
        }
      },

      usageTrackers: [],
      trackerLoading: false,
      trackerError: null,
      clearTrackerError: () => set({ trackerError: null }),

      fetchTrackers: async () => {
        set({ trackerLoading: true, trackerError: null });
        try {
          const usageTrackers = await trackerApi.list();
          set({ usageTrackers, trackerLoading: false, trackerError: null });
          return true;
        } catch (error) {
          set({
            trackerLoading: false,
            trackerError: resolveSettingsError(error, "Failed to load trackers"),
          });
          return false;
        }
      },

      addTracker: async (data) => {
        set({ trackerError: null });
        try {
          await trackerApi.create(data);
          const usageTrackers = await trackerApi.list();
          set({ usageTrackers, trackerError: null });
          return true;
        } catch (error) {
          set({ trackerError: resolveSettingsError(error, "Failed to create tracker") });
          return false;
        }
      },

      updateTracker: async (id, data) => {
        set({ trackerError: null });
        try {
          await trackerApi.update(id, data);
          const usageTrackers = await trackerApi.list();
          set({ usageTrackers, trackerError: null });
          return true;
        } catch (error) {
          set({ trackerError: resolveSettingsError(error, "Failed to update tracker") });
          return false;
        }
      },

      reorderTrackers: async (ids) => {
        const prev = get().usageTrackers;
        const reordered = ids.map((id) => prev.find((t) => t.id === id)!).filter(Boolean);
        set({ usageTrackers: reordered, trackerError: null });
        try {
          const usageTrackers = await trackerApi.reorder(ids);
          set({ usageTrackers, trackerError: null });
          return true;
        } catch (error) {
          set({ usageTrackers: prev, trackerError: resolveSettingsError(error, "Failed to reorder trackers") });
          return false;
        }
      },

      removeTracker: async (id) => {
        set({ trackerError: null });
        try {
          await trackerApi.delete(id);
          return await get().fetchTrackers();
        } catch (error) {
          set({ trackerError: resolveSettingsError(error, "Failed to delete tracker") });
          return false;
        }
      },

      assistantSystemPrompt: "",
      assistantSystemPromptLoading: false,
      assistantSystemPromptSaving: false,

      fetchAssistantSystemPrompt: async () => {
        set({ assistantSystemPromptLoading: true });
        try {
          const resp = await fetch("/api/contexts/assistant-system-prompt");
          const data = await resp.json();
          set({ assistantSystemPrompt: data.content || "", assistantSystemPromptLoading: false });
          return true;
        } catch {
          set({ assistantSystemPromptLoading: false });
          return false;
        }
      },

      saveAssistantSystemPrompt: async (content: string) => {
        set({ assistantSystemPromptSaving: true });
        try {
          const resp = await fetch("/api/contexts/assistant-system-prompt", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
          const data = await resp.json();
          set({ assistantSystemPrompt: data.content || "", assistantSystemPromptSaving: false });
          return true;
        } catch {
          set({ assistantSystemPromptSaving: false });
          return false;
        }
      },
    }),
    {
      name: 'wudao-settings',
      partialize: (state) => ({ theme: state.theme, user: state.user, assistant: state.assistant, taskSortBy: state.taskSortBy, taskSortOrder: state.taskSortOrder }), // Persist theme, user, assistant, sort and order
    }
  )
);
