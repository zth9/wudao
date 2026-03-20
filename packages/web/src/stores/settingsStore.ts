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
  fetch: () => Promise<void>;
  add: (data: Omit<Provider, "id" | "created_at" | "sort_order">) => Promise<void>;
  update: (id: string, data: Partial<Provider>) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
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

      fetch: async () => {
        set({ loading: true });
        const providers = await api.list();
        set({ providers, loading: false });
      },

      add: async (data) => {
        await api.create(data);
        await get().fetch();
      },

      update: async (id, data) => {
        await api.update(id, data);
        await get().fetch();
      },

      reorder: async (ids) => {
        const providers = await api.reorder(ids);
        set({ providers });
      },

      remove: async (id) => {
        await api.delete(id);
        await get().fetch();
      },
    }),
    {
      name: 'wudao-settings',
      partialize: (state) => ({ theme: state.theme, user: state.user, taskSortBy: state.taskSortBy, taskSortOrder: state.taskSortOrder }), // Persist theme, user, sort and order
    }
  )
);
