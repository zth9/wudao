import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  ChevronDown,
  LayoutDashboard,
  ListTodo,
  Settings as SettingsIcon,
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
  resolveViewChange,
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
  const { t } = useTranslation();
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute(window.location.search));
  const lastTaskIdRef = useRef<string | null>(route.taskId);
  const fetchProviders = useSettingsStore((s) => s.fetch);
  const user = useSettingsStore((s) => s.user);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const leftSectionRef = useRef<HTMLDivElement>(null);
  const rightSectionRef = useRef<HTMLDivElement>(null);
  const fullMenuMeasureRef = useRef<HTMLDivElement>(null);
  const [menuFits, setMenuFits] = useState(true);
  const [settingsEditTrackerId, setSettingsEditTrackerId] = useState<string | null>(null);

  const navItems = useMemo<Array<{ key: ViewKey; label: string; icon: LucideIcon }>>(
    () => [
      { key: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
      { key: "tasks", label: t("nav.tasks"), icon: ListTodo },
      { key: "memories", label: t("nav.memories"), icon: Brain },
      { key: "settings", label: t("nav.settings"), icon: SettingsIcon },
    ],
    [t],
  );


  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useLayoutEffect(() => {
    const check = () => {
      const header = headerRef.current;
      const left = leftSectionRef.current;
      const right = rightSectionRef.current;
      const menu = fullMenuMeasureRef.current;
      if (!header || !left || !right || !menu) return;
      const menuWidth = menu.offsetWidth;
      const available = header.clientWidth - left.offsetWidth - right.offsetWidth;
      setMenuFits(menuWidth <= available);
    };
    check();
    const ro = new ResizeObserver(check);
    if (headerRef.current) ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (route.view === "tasks") {
      lastTaskIdRef.current = route.taskId;
    }
  }, [route.view, route.taskId]);

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
    navigate(resolveViewChange({
      currentRoute: route,
      lastTaskCenterTaskId: lastTaskIdRef.current,
      targetView: view,
    }));
  }, [navigate, route]);

  const handleNavigateToSettingsTracker = useCallback((trackerId: string) => {
    setSettingsEditTrackerId(trackerId);
    navigate(resolveViewChange({
      currentRoute: route,
      lastTaskCenterTaskId: lastTaskIdRef.current,
      targetView: "settings",
    }));
  }, [navigate, route]);

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
  const activeNavItem = navItems.find((item) => item.key === activeView) ?? navItems[0];
  const ActiveNavIcon = activeNavItem.icon;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header ref={headerRef} className="h-14 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 z-30 shrink-0 relative bg-overlay/80">
        <div ref={leftSectionRef} className="flex items-center gap-2 min-w-[160px]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent flex items-center justify-center text-white text-xs font-extrabold shadow-sm">
            WD
          </div>
          <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-accent to-accent bg-clip-text text-transparent">Wudao</h1>
        </div>

        <nav className="absolute left-1/2 -translate-x-1/2" aria-label={t("nav.menu")}>
          <div
            ref={fullMenuMeasureRef}
            className="absolute invisible flex items-center gap-1 p-1 whitespace-nowrap"
            aria-hidden="true"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className="flex items-center gap-2 px-4 py-1.5 rounded-full">
                  <Icon size={16} className="shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
                </div>
              );
            })}
          </div>

          {menuFits && (
            <div className="flex items-center gap-1 p-1 bg-default rounded-full">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.key;
                return (
                  <Button
                    key={item.key}
                    onPress={() => handleViewChange(item.key)}
                    variant="ghost"
                    className={cn(
                      "flex items-center gap-2 px-4 py-1.5 rounded-full transition-colors duration-200 group relative",
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
                        className="absolute inset-0 bg-accent rounded-full shadow-sm z-0"
                        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                      />
                    )}
                  </Button>
                );
              })}
            </div>
          )}

          {!menuFits && (
            <div>
              <Dropdown isOpen={navMenuOpen} onOpenChange={setNavMenuOpen}>
                <Button
                  variant="ghost"
                  aria-label={t("nav.menu")}
                  className="flex h-8 min-h-0 items-center gap-2 rounded-full bg-default px-3 transition-all hover:bg-default/80"
                >
                  <ActiveNavIcon size={14} className="text-accent shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider truncate">
                    {activeNavItem.label}
                  </span>
                  <ChevronDown size={12} className="text-muted shrink-0" />
                </Button>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    aria-label={t("nav.menu")}
                    onAction={(key) => {
                      handleViewChange(String(key) as ViewKey);
                      setNavMenuOpen(false);
                    }}
                  >
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeView === item.key;
                      return (
                        <Dropdown.Item
                          key={item.key}
                          id={item.key}
                          textValue={item.label}
                          className={cn(
                            "flex items-center gap-2 py-1.5 font-bold",
                            isActive && "text-accent",
                          )}
                        >
                          <Icon size={14} className="shrink-0" />
                          <span className="text-xs uppercase tracking-wider">{item.label}</span>
                        </Dropdown.Item>
                      );
                    })}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          )}
        </nav>

        <div ref={rightSectionRef} className="flex items-center gap-4">
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
            {activeView === "dashboard" && <DashboardView onNavigate={handleViewChange} onNavigateToSettingsTracker={handleNavigateToSettingsTracker} />}

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

            {activeView === "settings" && (
                <SettingsView
                  initialSection={settingsEditTrackerId ? "usage" : undefined}
                  editTrackerId={settingsEditTrackerId}
                  onIntentHandled={() => setSettingsEditTrackerId(null)}
                />
              )}
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
