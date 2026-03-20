import { create } from "zustand";
import { persist } from "zustand/middleware";
import { providers as api, type Provider } from "../services/api";
import type { SortOption } from "../components/task-panel/constants";

export type Theme = 'light' | 'dark' | 'system';

export interface UserProfile {
  nickname: string;
  avatar: string;
}

interface SettingsState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  user: UserProfile;
  setUser: (user: Partial<UserProfile>) => void;
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
          return await get().fetch();
        } catch (error) {
          set({ error: resolveSettingsError(error, "Failed to save provider") });
          return false;
        }
      },

      update: async (id, data) => {
        set({ error: null });
        try {
          await api.update(id, data);
          return await get().fetch();
        } catch (error) {
          set({ error: resolveSettingsError(error, "Failed to save provider") });
          return false;
        }
      },

      reorder: async (ids) => {
        set({ error: null });
        try {
          const providers = await api.reorder(ids);
          set({ providers, error: null });
          return true;
        } catch (error) {
          set({ error: resolveSettingsError(error, "Failed to reorder providers") });
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
    }),
    {
      name: 'wudao-settings',
      partialize: (state) => ({ theme: state.theme, user: state.user, taskSortBy: state.taskSortBy, taskSortOrder: state.taskSortOrder }), // Persist theme, user, sort and order
    }
  )
);
