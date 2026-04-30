import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  LayoutDashboard,
  ListTodo,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  type LucideIcon,
} from "lucide-react";
import { motion } from "framer-motion";
import { useSettingsStore } from "./stores/settingsStore";
import { WsProvider } from "./contexts/WsContext";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { cn } from "./utils/cn";
import {
  buildAppLocation,
  parseAppRoute,
  routeEquals,
  type AppRoute,
  type ViewKey,
} from "./app-route";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { Avatar } from "@heroui/react/avatar";
import { Button } from "@heroui/react/button";
import { Dropdown } from "@heroui/react/dropdown";

const SettingsView = lazy(() => import("./components/SettingsView"));
const DashboardView = lazy(() => import("./components/DashboardView"));
const TaskListView = lazy(() => import("./components/TaskListView"));
const TaskWorkspaceView = lazy(() => import("./components/TaskWorkspaceView"));
const MemoriesView = lazy(() => import("./components/MemoriesView"));

function ViewFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex-1 min-h-0 p-8 flex items-center justify-center">
      <LoadingIndicator text={t("common.loading")} size={32} />
    </div>
  );
}

function AppInner() {
  const { t, i18n } = useTranslation();
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.search));
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const lastTaskIdRef = useRef<string | null>(route.taskId);
  const fetchProviders = useSettingsStore((s) => s.fetch);
  const { theme, setTheme, user } = useSettingsStore();

  const navItems = useMemo<Array<{ key: ViewKey; label: string; icon: LucideIcon }>>(
    () => [
      { key: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
      { key: "tasks", label: t("nav.tasks"), icon: ListTodo },
      { key: "memories", label: t("nav.memories"), icon: Brain },
      { key: "settings", label: t("nav.settings"), icon: SettingsIcon },
    ],
    [t],
  );

  const themeItems = useMemo(
    () => [
      { key: "light", icon: Sun, label: t("theme.light") },
      { key: "dark", icon: Moon, label: t("theme.dark") },
      { key: "system", icon: Monitor, label: t("theme.auto") },
    ],
    [t],
  );

  const languageItems = useMemo(
    () => [
      { key: "zh", label: "中文" },
      { key: "en", label: "English" },
    ],
    [],
  );

  const currentThemeIcon = themeItems.find((item) => item.key === theme)?.icon ?? Monitor;

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    if (route.taskId) {
      lastTaskIdRef.current = route.taskId;
    }
  }, [route.taskId]);

  useEffect(() => {
    const normalized = buildAppLocation(route, window.location.pathname);
    const current = `${window.location.pathname}${window.location.search}`;
    if (normalized !== current) {
      window.history.replaceState({}, "", normalized);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const next = parseAppRoute(window.location.search);
      setRoute((current) => (routeEquals(current, next) ? current : next));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((next: AppRoute, historyMode: "push" | "replace" = "push") => {
    setRoute((current) => (routeEquals(current, next) ? current : next));

    const target = buildAppLocation(next, window.location.pathname);
    const current = `${window.location.pathname}${window.location.search}`;
    if (target !== current) {
      window.history[historyMode === "replace" ? "replaceState" : "pushState"]({}, "", target);
    }
  }, []);

  const handleViewChange = useCallback((view: ViewKey) => {
    navigate({
      view,
      taskId: view === "tasks" ? (route.taskId || lastTaskIdRef.current) : null,
      autoStartChat: false,
    });
  }, [navigate, route.taskId]);

  const handleSelectTask = useCallback((taskId: string, options?: { autoStartChat?: boolean; historyMode?: "push" | "replace" }) => {
    navigate(
      { view: "tasks", taskId, autoStartChat: options?.autoStartChat === true },
      options?.historyMode ?? "push",
    );
  }, [navigate]);

  const handleBackToTaskList = useCallback(() => {
    navigate({ view: "tasks", taskId: null, autoStartChat: false });
  }, [navigate]);

  const activeView = route.view;
  const activeTaskId = route.taskId;
  const userDisplayName = user.nickname || t("common.user");

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="h-14 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 z-30 shrink-0 relative bg-overlay/80">
        <div className="flex items-center gap-2 min-w-[160px]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent flex items-center justify-center text-white text-xs font-extrabold shadow-sm">
            WD
          </div>
          <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-accent to-accent bg-clip-text text-transparent">Wudao</h1>
        </div>

        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 p-1 bg-default rounded-xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;
            return (
              <Button
                key={item.key}
                onPress={() => handleViewChange(item.key)}
                variant="ghost"
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg transition-colors duration-200 group relative",
                  isActive
                    ? "text-white"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon size={16} className={cn("relative z-10 transition-transform group-active:scale-90", isActive ? "text-white" : "text-accent")} />
                <span className="text-xs font-bold uppercase tracking-wider relative z-10">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 bg-accent rounded-lg shadow-sm z-0"
                    transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                  />
                )}
              </Button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          {/* Language Switcher */}
          <Dropdown
            isOpen={langMenuOpen}
            onOpenChange={(open) => {
              setLangMenuOpen(open);
              if (open) setThemeMenuOpen(false);
            }}
          >
            <Button
              aria-label={i18n.language.startsWith("zh") ? t("common.switch_to_english") : t("common.switch_to_chinese")}
              variant="ghost"
              isIconOnly
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-default border border-border text-muted hover:text-accent transition-colors text-xs font-bold"
            >
              {i18n.language.startsWith("zh") ? "中" : "En"}
            </Button>
            <Dropdown.Popover className="min-w-9 w-9">
              <Dropdown.Menu
                aria-label={i18n.language.startsWith("zh") ? t("common.switch_to_english") : t("common.switch_to_chinese")}
                onAction={(key) => {
                  void i18n.changeLanguage(String(key));
                  setLangMenuOpen(false);
                }}
              >
                {languageItems.map((item) => (
                    <Dropdown.Item
                      key={item.key}
                      id={item.key}
                      textValue={item.label}
                      className="justify-center px-1.5 py-1.5 font-bold"
                    >
                      <span className="text-xs">{item.key === "zh" ? "中" : "EN"}</span>
                    </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          {/* Theme Switcher */}
          <Dropdown
            isOpen={themeMenuOpen}
            onOpenChange={(open) => {
              setThemeMenuOpen(open);
              if (open) setLangMenuOpen(false);
            }}
          >
            <Button
              aria-label={themeItems.find((item) => item.key === theme)?.label ?? t("theme.auto")}
              variant="ghost"
              isIconOnly
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-default border border-border text-muted hover:text-accent transition-colors"
            >
              {(() => {
                const Icon = currentThemeIcon;
                return <Icon size={16} />;
              })()}
            </Button>
            <Dropdown.Popover className="min-w-9 w-9">
              <Dropdown.Menu
                aria-label={t("theme.auto")}
                onAction={(key) => {
                  setTheme(key as typeof theme);
                  setThemeMenuOpen(false);
                }}
              >
                {themeItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Dropdown.Item
                      key={item.key}
                      id={item.key}
                      textValue={item.label}
                      className="justify-center p-1.5 font-bold"
                    >
                      <Icon size={18} className={theme === item.key ? "text-white" : ""} />
                    </Dropdown.Item>
                  );
                })}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          <div className="flex items-center gap-3 px-2 border-l border-border ml-2 pl-6">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold tracking-tight">{userDisplayName}</p>
            </div>
            <Avatar size="sm" className="cursor-pointer hover:ring-2 hover:ring-accent/20 transition-all">
              {((user.avatar && user.avatar.startsWith("/api")) || user.avatar.startsWith("http")) ? (
                <Avatar.Image src={user.avatar} alt={t("common.avatar")} />
              ) : null}
              <Avatar.Fallback>{user.avatar || "👨‍💻"}</Avatar.Fallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-surface-secondary">
        <div className="flex-1 flex flex-col min-h-0">
          <Suspense fallback={<ViewFallback />}>
            {activeView === "dashboard" && <DashboardView onNavigate={handleViewChange} />}

            {activeView === "tasks" && (
              activeTaskId ? (
                <TaskWorkspaceView
                  taskId={activeTaskId}
                  autoStartChat={route.autoStartChat}
                  onBack={handleBackToTaskList}
                  onSwitchTask={handleSelectTask}
                  onAutoStartChatHandled={() => handleSelectTask(activeTaskId, { historyMode: "replace" })}
                />
              ) : (
                <TaskListView onSelect={handleSelectTask} />
              )
            )}

            {activeView === "memories" && <MemoriesView />}

            {activeView === "settings" && <SettingsView />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WsProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </WsProvider>
  );
}
