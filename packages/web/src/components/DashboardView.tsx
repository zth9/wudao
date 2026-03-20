import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../stores/settingsStore";
import { tasks as tasksApi, usage as usageApi, type ProviderUsage, type TaskStatsSummary } from "../services/api";
import {
  CheckCircle2,
  ArrowUpRight,
  Shield,
  Activity,
  TrendingUp,
  Box,
  Loader2,
  AlertCircle,
  ExternalLink,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "../utils/cn";
import { type ViewKey } from "../app-route";
import { LoadingIndicator } from "./LoadingIndicator";

interface Props {
  onNavigate: (view: ViewKey) => void;
}

const AUTO_REFRESH_MS = 30_000;
const AUTO_REFRESH_SECONDS = Math.ceil(AUTO_REFRESH_MS / 1000);

export default function DashboardView({ onNavigate }: Props) {
  const { t } = useTranslation();
  const user = useSettingsStore((state) => state.user);
  const [taskStats, setTaskStats] = useState<TaskStatsSummary>({ active: 0, done: 0, high_priority: 0, all: 0 });
  const [loadingTaskStats, setLoadingTaskStats] = useState(false);
  const [usageData, setUsageData] = useState<ProviderUsage[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [hasLoadedTaskStats, setHasLoadedTaskStats] = useState(false);
  const [nextRefreshSeconds, setNextRefreshSeconds] = useState(AUTO_REFRESH_SECONDS);
  const nextRefreshAtRef = useRef(Date.now() + AUTO_REFRESH_MS);
  const refreshInFlightRef = useRef(false);

  const scheduleNextRefresh = useCallback(() => {
    nextRefreshAtRef.current = Date.now() + AUTO_REFRESH_MS;
    setNextRefreshSeconds(AUTO_REFRESH_SECONDS);
  }, []);

  const fetchTaskStats = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoadingTaskStats(true);
    }
    try {
      const data = await tasksApi.stats();
      setTaskStats(data);
      setHasLoadedTaskStats(true);
    } finally {
      if (!silent) {
        setLoadingTaskStats(false);
      }
    }
  }, []);

  const fetchUsage = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoadingUsage(true);
    }
    setUsageError(null);
    try {
      const data = await usageApi.fetch();
      setUsageData(data);
    } catch {
      setUsageError(t("dashboard.usage_load_failed"));
      setUsageData([]);
    } finally {
      if (!silent) {
        setLoadingUsage(false);
      }
    }
  }, [t]);

  const refreshDashboard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      await Promise.allSettled([
        fetchUsage({ silent }),
        fetchTaskStats({ silent }),
      ]);
    } finally {
      scheduleNextRefresh();
      refreshInFlightRef.current = false;
    }
  }, [fetchTaskStats, fetchUsage, scheduleNextRefresh]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remainingMs = nextRefreshAtRef.current - Date.now();
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setNextRefreshSeconds(remainingSeconds);

      if (remainingMs <= 0 && !document.hidden) {
        void refreshDashboard({ silent: true });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refreshDashboard]);

  useEffect(() => {
    const syncVisibleDashboard = () => {
      if (document.hidden) return;
      void refreshDashboard({ silent: true });
    };

    window.addEventListener("focus", syncVisibleDashboard);
    document.addEventListener("visibilitychange", syncVisibleDashboard);
    return () => {
      window.removeEventListener("focus", syncVisibleDashboard);
      document.removeEventListener("visibilitychange", syncVisibleDashboard);
    };
  }, [refreshDashboard]);

  const stats = useMemo(() => {
    return [
      { id: "active", label: t("common.active"), value: taskStats.active, icon: Activity, color: "text-apple-blue", bg: "bg-apple-blue/10" },
      { id: "done", label: t("common.done"), value: taskStats.done, icon: CheckCircle2, color: "text-apple-green", bg: "bg-apple-green/10" },
      { id: "priority", label: `${t("priority_labels.0")}/${t("priority_labels.1")}`, value: taskStats.high_priority, icon: TrendingUp, color: "text-apple-red", bg: "bg-apple-red/10" },
      { id: "all", label: t("common.all"), value: taskStats.all, icon: Box, color: "text-apple-purple", bg: "bg-apple-purple/10" },
    ];
  }, [taskStats, t]);

  const displayName = user.nickname.trim() || t("common.user");
  const refreshBusy = loadingUsage || loadingTaskStats;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background-secondary dark:bg-black/40 overflow-y-auto">
      <header className="px-8 pt-8 pb-4 shrink-0 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-apple-blue uppercase tracking-[0.2em] mb-1">{t("dashboard.overview")}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("dashboard.welcome_user", { name: displayName })}</h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-system-gray-400 dark:text-system-gray-300 hidden sm:block">
            {t("dashboard.auto_refresh_in", { seconds: nextRefreshSeconds })}
          </p>
          <button
            onClick={() => void refreshDashboard()}
            disabled={refreshBusy}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-system-gray-400 dark:text-system-gray-300 transition-all active:rotate-180 duration-500"
            title={t("dashboard.refresh_dashboard")}
          >
            <RefreshCw size={18} className={cn(refreshBusy && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="flex-1 px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {loadingTaskStats && !hasLoadedTaskStats ? (
              <div className="col-span-full py-12 flex justify-center">
                <LoadingIndicator text={t("common.loading")} />
              </div>
            ) : (
              stats.map((stat) => (
                <button
                  key={stat.id}
                  onClick={() => onNavigate("tasks")}
                  className="apple-card p-5 group transition-all text-left w-full"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn("p-2 rounded-apple-lg", stat.bg)}>
                      <stat.icon size={20} className={stat.color} />
                    </div>
                    <ArrowUpRight size={16} className="text-system-gray-300 group-hover:text-apple-blue transition-colors" />
                  </div>
                  <p className="text-[11px] font-bold text-system-gray-400 dark:text-system-gray-300 uppercase tracking-widest">{stat.label}</p>
                  <p className="text-3xl font-black mt-1 tracking-tight">{stat.value}</p>
                </button>
              ))
            )}
          </div>

          <div className="space-y-8">
            <section className="apple-card p-6 min-h-[400px]">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-apple-purple" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-system-gray-500 dark:text-system-gray-400">{t("dashboard.usage_stats")}</h2>
                </div>
              </div>

              {loadingUsage && usageData.length === 0 ? (
                <div className="flex-1 py-20 flex justify-center">
                   <LoadingIndicator text={t("dashboard.loading_usage")} />
                </div>
              ) : usageData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {usageData.map((usage) => (
                    <div
                      key={usage.provider}
                      className="p-5 rounded-apple-2xl bg-system-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10 relative overflow-hidden group flex flex-col"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-apple-lg bg-apple-blue/10 flex items-center justify-center text-apple-blue">
                            <Shield size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold tracking-tight">{usage.provider}</p>
                            <p className="text-[10px] text-system-gray-400 dark:text-system-gray-300 font-bold uppercase tracking-widest">
                              {usage.status === "ok" ? t("dashboard.provider_connected") : t("dashboard.provider_error")}
                            </p>
                          </div>
                        </div>
                        {usage.url && (
                          <a href={usage.url} target="_blank" rel="noreferrer" className="p-2 rounded-full hover:bg-apple-blue/10 text-system-gray-300 hover:text-apple-blue transition-all">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>

                      <div className="space-y-6 flex-1">
                        {usage.items.map((item) => (
                          <div key={item.label} className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[11px] font-bold text-system-gray-500 dark:text-system-gray-400 uppercase tracking-tight">{item.label}</span>
                              <span className="text-xs font-black tabular-nums">{item.used}{item.total ? ` / ${item.total}` : ""}</span>
                            </div>

                            {item.total && (
                              <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    (item.used / item.total) > 0.9 ? "bg-apple-red" : "bg-apple-blue",
                                  )}
                                  style={{ width: `${Math.min(100, (item.used / item.total) * 100)}%` }}
                                />
                              </div>
                            )}

                            {item.detail && (
                              <div className="flex items-start gap-1.5 px-1 pt-1">
                                <Clock size={10} className="text-system-gray-400 dark:text-system-gray-300 mt-0.5 shrink-0" />
                                <p className="text-[10px] leading-relaxed text-system-gray-400 dark:text-system-gray-300 font-medium">
                                  {item.detail.split(" · ").map((part, index) => (
                                    <span key={index} className={cn(/刷新|重置|refresh/i.test(part) ? "text-apple-blue/80 font-bold" : "")}>
                                      {index > 0 && " · "}
                                      {part}
                                    </span>
                                  ))}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {usage.status === "error" && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                          <AlertCircle size={32} className="text-apple-red mb-2" />
                          <p className="text-xs font-bold text-apple-red px-4 leading-tight">{usage.error || t("dashboard.auth_failed")}</p>
                          <button
                            onClick={() => onNavigate("settings")}
                            className="mt-4 text-[10px] font-black text-apple-blue uppercase tracking-widest hover:underline"
                          >
                            {t("dashboard.fix_in_settings")}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-20">
                  {loadingUsage ? (
                    <LoadingIndicator text={t("dashboard.loading_usage")} />
                  ) : (
                    <>
                      <div className="w-16 h-1 bg-system-gray-100 dark:bg-system-gray-800 rounded-full mb-4" />
                      <p className="text-xs font-medium uppercase tracking-widest">{usageError || t("dashboard.no_usage")}</p>
                    </>
                  )}
                </div>
              )}
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
