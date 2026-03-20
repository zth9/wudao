import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  Brain,
  FolderOpen,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  User,
  WandSparkles,
} from "lucide-react";
import MarkdownContent from "./MarkdownContent";
import { LoadingIndicator } from "./LoadingIndicator";
import {
  contexts as contextsApi,
  system,
  type OpenVikingMemoryItem,
  type OpenVikingStatus,
  type WudaoAgentMemorySaveResult,
  type WudaoUserMemorySaveResult,
} from "../services/api";
import { cn } from "../utils/cn";
import { formatLocalizedDateInDefaultTimeZone } from "../utils/time";

type ScopeFilter = "all" | "user" | "agent";
type MemoryModule = "user" | "agent" | "openviking";

function resolveApiError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  const jsonStart = error.message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // ignore parse failures
    }
  }

  return error.message || fallback;
}

export default function MemoriesView() {
  const { t, i18n } = useTranslation();
  const [activeModule, setActiveModule] = useState<MemoryModule>("user");
  const isEditorModule = activeModule === "user" || activeModule === "agent";

  const [status, setStatus] = useState<OpenVikingStatus | null>(null);
  const [memories, setMemories] = useState<OpenVikingMemoryItem[]>([]);
  const [openvikingLoading, setOpenvikingLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openvikingError, setOpenvikingError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");

  const [userMemory, setUserMemory] = useState("");
  const [userMemoryPath, setUserMemoryPath] = useState("");
  const [userMemoryLoading, setUserMemoryLoading] = useState(true);
  const [userMemorySaving, setUserMemorySaving] = useState(false);
  const [userMemoryMessage, setUserMemoryMessage] = useState<string | null>(null);
  const [userMemoryWarning, setUserMemoryWarning] = useState<string | null>(null);

  const [agentMemory, setAgentMemory] = useState("");
  const [agentMemoryPath, setAgentMemoryPath] = useState("");
  const [agentMemoryLoading, setAgentMemoryLoading] = useState(true);
  const [agentMemorySaving, setAgentMemorySaving] = useState(false);
  const [agentMemoryMessage, setAgentMemoryMessage] = useState<string | null>(null);
  const [agentMemoryWarning, setAgentMemoryWarning] = useState<string | null>(null);

  const loadUserMemory = useCallback(async (preserveDraft = false) => {
    setUserMemoryLoading(true);
    try {
      const result = await contextsApi.getUserMemory();
      setUserMemoryPath(result.path);
      if (!preserveDraft) {
        setUserMemory(result.content);
      }
      setUserMemoryWarning(null);
    } catch (error) {
      setUserMemoryWarning(resolveApiError(error, t("memories.user_memory_load_failed")));
    } finally {
      setUserMemoryLoading(false);
    }
  }, [t]);

  const loadAgentMemory = useCallback(async (preserveDraft = false) => {
    setAgentMemoryLoading(true);
    try {
      const result = await contextsApi.getAgentMemory();
      setAgentMemoryPath(result.path);
      if (!preserveDraft) {
        setAgentMemory(result.content);
      }
      setAgentMemoryWarning(null);
    } catch (error) {
      setAgentMemoryWarning(resolveApiError(error, t("memories.agent_memory_load_failed")));
    } finally {
      setAgentMemoryLoading(false);
    }
  }, [t]);

  const loadOpenViking = useCallback(async () => {
    setOpenvikingLoading(true);
    try {
      const nextStatus = await contextsApi.status();
      setStatus(nextStatus);

      if (!nextStatus.available) {
        setMemories([]);
        setOpenvikingError(nextStatus.message || t("memories.unavailable_desc"));
        return;
      }

      const result = await contextsApi.listMemories();
      setMemories(result.items);
      setOpenvikingError(null);
    } catch (error) {
      setMemories([]);
      setOpenvikingError(resolveApiError(error, t("memories.load_failed")));
    } finally {
      setOpenvikingLoading(false);
    }
  }, [t]);

  const refreshAll = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    await Promise.all([
      loadUserMemory(),
      loadAgentMemory(),
      loadOpenViking(),
    ]);
    if (silent) setRefreshing(false);
  }, [loadUserMemory, loadAgentMemory, loadOpenViking]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const filteredMemories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return memories.filter((item) => {
      if (scope !== "all" && item.scope !== scope) return false;
      if (!normalizedQuery) return true;
      const haystack = [item.title, item.category, item.uri, item.preview, item.content].join("\n").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [memories, query, scope]);

  const scopeOptions = useMemo<Array<{ key: ScopeFilter; label: string }>>(
    () => [
      { key: "all", label: t("common.all") },
      { key: "user", label: t("memories.scope_user") },
      { key: "agent", label: t("memories.scope_agent") },
    ],
    [t],
  );

  const moduleOptions = useMemo<Array<{ key: MemoryModule; label: string; icon: typeof User }>>(
    () => [
      { key: "user", label: t("memories.modules.user"), icon: User },
      { key: "agent", label: t("memories.modules.agent"), icon: WandSparkles },
      { key: "openviking", label: t("memories.modules.openviking"), icon: Brain },
    ],
    [t],
  );

  const handleSaveUserMemory = useCallback(async () => {
    setUserMemorySaving(true);
    setUserMemoryMessage(null);
    setUserMemoryWarning(null);
    try {
      const result: WudaoUserMemorySaveResult = await contextsApi.updateUserMemory(userMemory);
      setUserMemory(result.content);
      setUserMemoryPath(result.path);
      if (result.mirrorError) {
        setUserMemoryWarning(t("memories.user_memory_saved_with_warning", { error: result.mirrorError }));
      } else {
        setUserMemoryMessage(t("memories.user_memory_saved"));
      }
      await loadOpenViking();
    } catch (error) {
      setUserMemoryWarning(resolveApiError(error, t("memories.user_memory_save_failed")));
    } finally {
      setUserMemorySaving(false);
    }
  }, [loadOpenViking, t, userMemory]);

  const handleSaveAgentMemory = useCallback(async () => {
    setAgentMemorySaving(true);
    setAgentMemoryMessage(null);
    setAgentMemoryWarning(null);
    try {
      const result: WudaoAgentMemorySaveResult = await contextsApi.updateAgentMemory(agentMemory);
      setAgentMemory(result.content);
      setAgentMemoryPath(result.path);
      if (result.mirrorError) {
        setAgentMemoryWarning(t("memories.agent_memory_saved_with_warning", { error: result.mirrorError }));
      } else {
        setAgentMemoryMessage(t("memories.agent_memory_saved"));
      }
      await loadOpenViking();
    } catch (error) {
      setAgentMemoryWarning(resolveApiError(error, t("memories.agent_memory_save_failed")));
    } finally {
      setAgentMemorySaving(false);
    }
  }, [agentMemory, loadOpenViking, t]);

  const handleOpenPath = useCallback(async (targetPath: string | null | undefined, fallback: string) => {
    if (!targetPath) return;
    try {
      await system.openPath(targetPath);
    } catch (error) {
      const message = resolveApiError(error, fallback);
      if (activeModule === "openviking") {
        setOpenvikingError(message);
      } else if (activeModule === "agent") {
        setAgentMemoryWarning(message);
      } else {
        setUserMemoryWarning(message);
      }
    }
  }, [activeModule]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background-secondary dark:bg-black/40">
      <header className="px-8 pt-8 pb-4 shrink-0 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-apple-blue uppercase tracking-[0.2em] mb-1">{t("memories.kicker")}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("memories.title")}</h1>
          <p className="mt-2 text-sm text-system-gray-500 dark:text-system-gray-300 max-w-3xl">{t("memories.subtitle")}</p>
        </div>
        <button
          onClick={() => void refreshAll(true)}
          className="inline-flex items-center gap-2 rounded-apple-xl bg-apple-blue px-4 py-2 text-sm font-semibold text-white shadow-apple-sm transition-opacity hover:opacity-90"
        >
          <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
          <span>{refreshing ? t("memories.refreshing") : t("common.refresh")}</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 px-8 pb-8">
        <div className={cn("mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-6", isEditorModule && "overflow-hidden")}>
          <section className="shrink-0 flex items-center gap-2 flex-wrap">
            {moduleOptions.map((option) => {
              const active = activeModule === option.key;
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  onClick={() => setActiveModule(option.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                    active
                      ? "bg-apple-blue text-white"
                      : "bg-black/5 text-system-gray-500 hover:text-apple-blue dark:bg-white/5 dark:text-system-gray-300",
                  )}
                >
                  <Icon size={14} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </section>

          {activeModule === "user" && (
            <section className="apple-card flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <User size={18} className="text-apple-blue" />
                    <h2 className="text-lg font-semibold tracking-tight">{t("memories.user_memory_title")}</h2>
                  </div>
                  <p className="mt-2 text-sm text-system-gray-500 dark:text-system-gray-300 max-w-3xl">{t("memories.user_memory_desc")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void handleOpenPath(userMemoryPath, t("memories.open_file_failed"))}
                    disabled={!userMemoryPath}
                    className="inline-flex items-center gap-2 rounded-apple-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-system-gray-600 dark:text-system-gray-200 transition-colors hover:text-apple-blue disabled:opacity-50"
                  >
                    <FolderOpen size={16} />
                    <span>{t("memories.open_file")}</span>
                  </button>
                  <button
                    onClick={() => setUserMemory("")}
                    disabled={userMemorySaving}
                    className="inline-flex items-center gap-2 rounded-apple-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-system-gray-600 dark:text-system-gray-200 transition-colors hover:text-apple-blue disabled:opacity-50"
                  >
                    <span>{t("memories.clear_user_memory")}</span>
                  </button>
                  <button
                    onClick={() => void handleSaveUserMemory()}
                    disabled={userMemorySaving || userMemoryLoading}
                    className="inline-flex items-center gap-2 rounded-apple-xl bg-apple-blue px-4 py-2 text-sm font-semibold text-white shadow-apple-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {userMemorySaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{userMemorySaving ? t("memories.saving_user_memory") : t("memories.save_user_memory")}</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 shrink-0 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.user_memory_path")}</p>
                <p className="text-sm font-medium break-all">{userMemoryPath || t("common.none")}</p>
              </div>

              {userMemoryLoading ? (
                <div className="flex flex-1 min-h-0 items-center justify-center py-12"><LoadingIndicator text={t("memories.loading")} /></div>
              ) : (
                <div className="mt-4 flex flex-1 min-h-0 flex-col gap-4">
                  <textarea
                    value={userMemory}
                    onChange={(e) => setUserMemory(e.target.value)}
                    placeholder={t("memories.user_memory_placeholder")}
                    className="apple-memory-textarea h-full max-h-full min-h-0 w-full flex-1 rounded-apple-2xl border border-black/5 bg-black/5 px-4 py-4 text-sm leading-6 outline-none transition-colors focus:border-apple-blue/50 focus:ring-2 focus:ring-apple-blue/10 dark:border-white/10 dark:bg-white/5"
                  />
                  <p className="shrink-0 text-sm text-system-gray-500 dark:text-system-gray-300">{t("memories.user_memory_hint")}</p>
                </div>
              )}

              {userMemoryMessage && <div className="mt-4 shrink-0 rounded-apple-xl border border-apple-blue/20 bg-apple-blue/5 px-4 py-3 text-sm text-apple-blue">{userMemoryMessage}</div>}
              {userMemoryWarning && <div className="mt-4 shrink-0 rounded-apple-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-300 whitespace-pre-wrap break-words">{userMemoryWarning}</div>}
            </section>
          )}

          {activeModule === "agent" && (
            <section className="apple-card flex min-h-0 flex-1 flex-col overflow-hidden p-6">
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <WandSparkles size={18} className="text-apple-blue" />
                    <h2 className="text-lg font-semibold tracking-tight">{t("memories.agent_memory_title")}</h2>
                  </div>
                  <p className="mt-2 text-sm text-system-gray-500 dark:text-system-gray-300 max-w-3xl">{t("memories.agent_memory_desc")}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void handleOpenPath(agentMemoryPath, t("memories.open_file_failed"))}
                    disabled={!agentMemoryPath}
                    className="inline-flex items-center gap-2 rounded-apple-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-system-gray-600 dark:text-system-gray-200 transition-colors hover:text-apple-blue disabled:opacity-50"
                  >
                    <FolderOpen size={16} />
                    <span>{t("memories.open_file")}</span>
                  </button>
                  <button
                    onClick={() => setAgentMemory("")}
                    disabled={agentMemorySaving}
                    className="inline-flex items-center gap-2 rounded-apple-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-system-gray-600 dark:text-system-gray-200 transition-colors hover:text-apple-blue disabled:opacity-50"
                  >
                    <span>{t("memories.clear_agent_memory")}</span>
                  </button>
                  <button
                    onClick={() => void handleSaveAgentMemory()}
                    disabled={agentMemorySaving || agentMemoryLoading}
                    className="inline-flex items-center gap-2 rounded-apple-xl bg-apple-blue px-4 py-2 text-sm font-semibold text-white shadow-apple-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {agentMemorySaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{agentMemorySaving ? t("memories.saving_agent_memory") : t("memories.save_agent_memory")}</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 shrink-0 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.agent_memory_path")}</p>
                <p className="text-sm font-medium break-all">{agentMemoryPath || t("common.none")}</p>
              </div>

              {agentMemoryLoading ? (
                <div className="flex flex-1 min-h-0 items-center justify-center py-12"><LoadingIndicator text={t("memories.loading")} /></div>
              ) : (
                <div className="mt-4 flex flex-1 min-h-0 flex-col gap-4">
                  <textarea
                    value={agentMemory}
                    onChange={(e) => setAgentMemory(e.target.value)}
                    placeholder={t("memories.agent_memory_placeholder")}
                    className="apple-memory-textarea h-full max-h-full min-h-0 w-full flex-1 rounded-apple-2xl border border-black/5 bg-black/5 px-4 py-4 text-sm leading-6 outline-none transition-colors focus:border-apple-blue/50 focus:ring-2 focus:ring-apple-blue/10 dark:border-white/10 dark:bg-white/5"
                  />
                  <p className="shrink-0 text-sm text-system-gray-500 dark:text-system-gray-300">{t("memories.agent_memory_hint")}</p>
                </div>
              )}

              {agentMemoryMessage && <div className="mt-4 shrink-0 rounded-apple-xl border border-apple-blue/20 bg-apple-blue/5 px-4 py-3 text-sm text-apple-blue">{agentMemoryMessage}</div>}
              {agentMemoryWarning && <div className="mt-4 shrink-0 rounded-apple-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-600 dark:text-amber-300 whitespace-pre-wrap break-words">{agentMemoryWarning}</div>}
            </section>
          )}

          {activeModule === "openviking" && (
            <div className="flex-1 min-h-0 space-y-6 overflow-y-auto pr-1">
              <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <div className="apple-card p-5 lg:col-span-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.status")}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-apple-xl flex items-center justify-center", status?.available ? "bg-apple-blue/10 text-apple-blue" : "bg-red-500/10 text-red-500")}>
                          {status?.available ? <Brain size={20} /> : <AlertCircle size={20} />}
                        </div>
                        <div>
                          <p className="text-lg font-bold tracking-tight">{status?.available ? t("memories.available") : t("memories.unavailable")}</p>
                          <p className="text-sm text-system-gray-500 dark:text-system-gray-300">{status?.message || t("memories.available_desc")}</p>
                        </div>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-black/5 dark:bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-system-gray-500 dark:text-system-gray-300">{status?.mode === "embedded" ? t("memories.mode_embedded") : t("common.loading")}</span>
                  </div>
                </div>
                <div className="apple-card p-5">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.total")}</p>
                  <p className="mt-3 text-3xl font-black tracking-tight">{memories.length}</p>
                  <p className="mt-2 text-sm text-system-gray-500 dark:text-system-gray-300">{t("memories.total_desc")}</p>
                </div>
                <div className="apple-card p-5 space-y-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.workspace")}</p>
                    <p className="mt-2 text-sm font-medium break-all">{status?.workspacePath || t("common.none")}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.config")}</p>
                    <p className="mt-2 text-sm font-medium break-all">{status?.configPath || t("common.none")}</p>
                  </div>
                  <button
                    onClick={() => void handleOpenPath(status?.workspacePath, t("memories.open_dir_failed"))}
                    disabled={!status?.workspacePath}
                    className="inline-flex items-center gap-2 rounded-apple-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-2 text-sm font-semibold text-system-gray-600 dark:text-system-gray-200 transition-colors hover:text-apple-blue disabled:opacity-50"
                  >
                    <FolderOpen size={16} />
                    <span>{t("memories.open_directory")}</span>
                  </button>
                </div>
              </section>

              <section className="apple-card p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <label className="relative flex-1 block">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-system-gray-400 dark:text-system-gray-300" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t("memories.search_placeholder")}
                      className="w-full rounded-apple-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 pl-11 pr-4 py-3 text-sm outline-none transition-colors focus:border-apple-blue/50 focus:ring-2 focus:ring-apple-blue/10"
                    />
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {scopeOptions.map((option) => {
                      const active = scope === option.key;
                      return (
                        <button
                          key={option.key}
                          onClick={() => setScope(option.key)}
                          className={cn(
                            "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors",
                            active ? "bg-apple-blue text-white" : "bg-black/5 text-system-gray-500 hover:text-apple-blue dark:bg-white/5 dark:text-system-gray-300",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {openvikingLoading ? (
                  <div className="py-20 flex justify-center"><LoadingIndicator text={t("memories.loading")} /></div>
                ) : openvikingError ? (
                  <div className="rounded-apple-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-500 dark:text-red-300">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold">{t("memories.load_failed")}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{openvikingError}</p>
                      </div>
                    </div>
                  </div>
                ) : filteredMemories.length === 0 ? (
                  <div className="rounded-apple-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-10 text-center">
                    <div className="mx-auto w-12 h-12 rounded-apple-xl bg-apple-blue/10 text-apple-blue flex items-center justify-center"><Sparkles size={22} /></div>
                    <h2 className="mt-4 text-lg font-semibold tracking-tight">{t("memories.empty_title")}</h2>
                    <p className="mt-2 text-sm text-system-gray-500 dark:text-system-gray-300">{query.trim() || scope !== "all" ? t("memories.empty_filtered") : t("memories.empty_desc")}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filteredMemories.map((item) => (
                      <article key={item.uri} className="apple-card p-5 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className="inline-flex items-center rounded-full bg-apple-blue/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-apple-blue">{item.scope === "user" ? t("memories.scope_user") : t("memories.scope_agent")}</span>
                              <span className="inline-flex items-center rounded-full bg-black/5 dark:bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-system-gray-500 dark:text-system-gray-300">{item.category}</span>
                            </div>
                            <h2 className="text-lg font-semibold tracking-tight break-words">{item.title}</h2>
                            <p className="mt-2 text-xs text-system-gray-400 dark:text-system-gray-300 break-all">{item.uri}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300">{t("memories.updated_at")}</p>
                            <p className="mt-1 text-sm font-medium">{item.updatedAt ? formatLocalizedDateInDefaultTimeZone(item.updatedAt, i18n.language) : t("common.none")}</p>
                          </div>
                        </div>
                        <div className="rounded-apple-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 p-4">
                          <p className="text-sm leading-6 whitespace-pre-wrap break-words text-system-gray-600 dark:text-system-gray-100">{item.preview || t("memories.no_preview")}</p>
                        </div>
                        <details className="rounded-apple-2xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 group">
                          <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold tracking-tight">{t("memories.full_content")}</span>
                            <span className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300 group-open:hidden">{t("memories.expand")}</span>
                            <span className="text-[11px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300 hidden group-open:inline">{t("memories.collapse")}</span>
                          </summary>
                          <div className="pt-4 border-t border-black/5 dark:border-white/10 mt-4">
                            <MarkdownContent content={item.content || item.preview} className="text-system-gray-700 dark:text-system-gray-100" />
                          </div>
                        </details>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
