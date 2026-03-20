import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockList,
  mockCreate,
  mockUpdate,
  mockReorder,
  mockDelete,
  memoryStorage,
} = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockReorder: vi.fn(),
  mockDelete: vi.fn(),
  memoryStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.stubGlobal("localStorage", memoryStorage);

vi.mock("../services/api", () => ({
  providers: {
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    reorder: mockReorder,
    delete: mockDelete,
  },
}));

import { useSettingsStore } from "./settingsStore";

const resetStore = () => {
  useSettingsStore.setState({
    theme: "system",
    user: { nickname: "", avatar: "" },
    taskSortBy: "updated_at",
    taskSortOrder: "desc",
    providers: [],
    loading: false,
    error: null,
  });
};

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settingsStore.fetch", () => {
  it("sets loading true during the request and false after success", async () => {
    let loadingDuringCall = false;
    mockList.mockImplementation(() => {
      loadingDuringCall = useSettingsStore.getState().loading;
      return Promise.resolve([]);
    });

    const ok = await useSettingsStore.getState().fetch();

    expect(ok).toBe(true);
    expect(loadingDuringCall).toBe(true);
    expect(useSettingsStore.getState().loading).toBe(false);
    expect(useSettingsStore.getState().error).toBeNull();
  });

  it("clears loading and stores the error when the request fails", async () => {
    mockList.mockRejectedValue(new Error('API error 500: {"error":"db unavailable"}'));

    const ok = await useSettingsStore.getState().fetch();

    expect(ok).toBe(false);
    expect(useSettingsStore.getState().loading).toBe(false);
    expect(useSettingsStore.getState().error).toBe("db unavailable");
  });
});

describe("settingsStore.add", () => {
  it("returns false and preserves the error when create fails", async () => {
    mockCreate.mockRejectedValue(new Error('API error 400: {"error":"name, endpoint, model are required"}'));

    const ok = await useSettingsStore.getState().add({
      name: "Provider",
      endpoint: "http://localhost:11434",
      api_key: "",
      usage_auth_token: "",
      usage_cookie: "",
      model: "qwen2.5",
      is_default: 0,
    });

    expect(ok).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().error).toBe("name, endpoint, model are required");
  });

  it("returns false when refresh after create fails so the caller can keep the dialog open", async () => {
    mockCreate.mockResolvedValue({
      id: "provider-1",
      name: "Provider",
      endpoint: "http://localhost:11434",
      api_key: null,
      usage_auth_token: null,
      usage_cookie: null,
      model: "qwen2.5",
      is_default: 0,
      sort_order: 1,
      created_at: "2026-03-20T00:00:00Z",
    });
    mockList.mockRejectedValue(new Error("API error 502: upstream unavailable"));

    const ok = await useSettingsStore.getState().add({
      name: "Provider",
      endpoint: "http://localhost:11434",
      api_key: "",
      usage_auth_token: "",
      usage_cookie: "",
      model: "qwen2.5",
      is_default: 0,
    });

    expect(ok).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().error).toBe("API error 502: upstream unavailable");
  });
});
