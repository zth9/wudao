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
  AlertCircle,
  ExternalLink,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "../utils/cn";
import { type ViewKey } from "../app-route";
import { LoadingIndicator } from "./LoadingIndicator";
import { Button } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { ProgressBar } from "@heroui/react/progress-bar";
import { Tooltip } from "@heroui/react/tooltip";

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
      { id: "active", label: t("common.active"), value: taskStats.active, icon: Activity, color: "text-accent", bg: "bg-accent/10" },
      { id: "done", label: t("common.done"), value: taskStats.done, icon: CheckCircle2, color: "text-success", bg: "bg-success/10" },
      { id: "priority", label: `${t("priority_labels.0")}/${t("priority_labels.1")}`, value: taskStats.high_priority, icon: TrendingUp, color: "text-danger", bg: "bg-danger/10" },
      { id: "all", label: t("common.all"), value: taskStats.all, icon: Box, color: "text-accent", bg: "bg-accent/10" },
    ];
  }, [taskStats, t]);

  const displayName = user.nickname.trim() || t("common.user");
  const refreshBusy = loadingUsage || loadingTaskStats;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-secondary dark:bg-background overflow-y-auto">
      <header className="px-8 pt-8 pb-4 shrink-0 flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold text-accent uppercase tracking-[0.2em] mb-1">{t("dashboard.overview")}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("dashboard.welcome_user", { name: displayName })}</h1>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted hidden sm:block">
            {t("dashboard.auto_refresh_in", { seconds: nextRefreshSeconds })}
          </p>
          <Tooltip delay={300} closeDelay={0}>
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => void refreshDashboard()}
              isDisabled={refreshBusy}
              className="text-muted duration-500 active:rotate-180"
              aria-label={t("dashboard.refresh_dashboard")}
            >
              <RefreshCw size={18} className={cn(refreshBusy && "animate-spin")} />
            </Button>
            <Tooltip.Content
              className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md"
              placement="top"
              showArrow
            >
              <Tooltip.Arrow className="fill-overlay" />
              {t("dashboard.refresh_dashboard")}
            </Tooltip.Content>
          </Tooltip>
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
                <Button
                  key={stat.id}
                  variant="ghost"
                  onPress={() => onNavigate("tasks")}
                  className="group w-full rounded-xl border border-border bg-surface p-5 text-left shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn("p-2 rounded-lg", stat.bg)}>
                      <stat.icon size={20} className={stat.color} />
                    </div>
                    <ArrowUpRight size={16} className="text-default-foreground group-hover:text-accent transition-colors" />
                  </div>
                  <p className="text-[11px] font-bold text-muted uppercase tracking-widest">{stat.label}</p>
                  <p className="text-3xl font-black mt-1 tracking-tight">{stat.value}</p>
                </Button>
              ))
            )}
          </div>

          <div className="space-y-8">
            <Card className="min-h-[400px] p-6">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-accent" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{t("dashboard.usage_stats")}</h2>
                </div>
              </div>

              {loadingUsage && usageData.length === 0 ? (
                <div className="flex-1 py-20 flex justify-center">
                   <LoadingIndicator text={t("dashboard.loading_usage")} />
                </div>
              ) : usageData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {usageData.map((usage) => (
                    <Card
                      key={usage.provider}
                      className="relative flex flex-col overflow-hidden rounded-2xl bg-surface-secondary p-5 shadow-none"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                            <Shield size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold tracking-tight">{usage.provider}</p>
                            <p className="text-[10px] text-muted font-bold uppercase tracking-widest">
                              {usage.status === "ok" ? t("dashboard.provider_connected") : t("dashboard.provider_error")}
                            </p>
                          </div>
                        </div>
                        {usage.url && (
                          <a href={usage.url} target="_blank" rel="noreferrer" className="p-2 rounded-full hover:bg-accent/10 text-default-foreground hover:text-accent transition-all">
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>

                      <div className="space-y-6 flex-1">
                        {usage.items.map((item) => (
                          <div key={item.label} className="space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <span className="text-[11px] font-bold text-muted uppercase tracking-tight">{item.label}</span>
                              <span className="text-xs font-black tabular-nums">{item.used}{item.total ? ` / ${item.total}` : ""}</span>
                            </div>

                            {item.total && (
                              <ProgressBar
                                aria-label={item.label}
                                value={Math.min(100, (item.used / item.total) * 100)}
                                color={(item.used / item.total) > 0.9 ? "danger" : "accent"}
                                className="h-2"
                              >
                                <ProgressBar.Track>
                                  <ProgressBar.Fill />
                                </ProgressBar.Track>
                              </ProgressBar>
                            )}

                            {item.detail && (
                              <div className="flex items-start gap-1.5 px-1 pt-1">
                                <Clock size={10} className="text-muted mt-0.5 shrink-0" />
                                <p className="text-[10px] leading-relaxed text-muted font-medium">
                                  {item.detail.split(" · ").map((part, index) => (
                                    <span key={index} className={cn(/刷新|重置|refresh/i.test(part) ? "text-accent font-bold" : "")}>
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
                        <div className="absolute inset-0 bg-overlay/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                          <AlertCircle size={32} className="text-danger mb-2" />
                          <p className="text-xs font-bold text-danger px-4 leading-tight">{usage.error || t("dashboard.auth_failed")}</p>
                          <Button
                            variant="ghost"
                            onPress={() => onNavigate("settings")}
                            className="mt-4 h-auto p-0 text-[10px] font-black uppercase tracking-widest text-accent hover:underline"
                          >
                            {t("dashboard.fix_in_settings")}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-20">
                  {loadingUsage ? (
                    <LoadingIndicator text={t("dashboard.loading_usage")} />
                  ) : (
                    <>
                      <div className="w-16 h-1 bg-default rounded-full mb-4" />
                      <p className="text-xs font-medium uppercase tracking-widest">{usageError || t("dashboard.no_usage")}</p>
                    </>
                  )}
                </div>
              )}
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
