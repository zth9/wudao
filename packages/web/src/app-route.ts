export type ViewKey = "dashboard" | "tasks" | "memories" | "settings";

export interface AppRoute {
  view: ViewKey;
  taskId: string | null;
  autoStartChat: boolean;
}

const VALID_VIEWS = new Set<ViewKey>(["dashboard", "tasks", "memories", "settings"]);

export function parseAppRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const rawTaskId = params.get("taskId")?.trim() || null;
  const rawView = params.get("view");
  const rawAutoStartChat = params.get("autoStartChat") === "1";

  const view: ViewKey = VALID_VIEWS.has(rawView as ViewKey)
    ? (rawView as ViewKey)
    : rawTaskId
      ? "tasks"
      : "dashboard";

  return {
    view,
    taskId: view === "tasks" ? rawTaskId : null,
    autoStartChat: view === "tasks" && !!rawTaskId && rawAutoStartChat,
  };
}

export function buildAppRouteSearch(route: AppRoute): string {
  const params = new URLSearchParams();

  if (route.view !== "dashboard") {
    params.set("view", route.view);
  }

  if (route.view === "tasks" && route.taskId) {
    params.set("taskId", route.taskId);
    if (route.autoStartChat) {
      params.set("autoStartChat", "1");
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function buildAppLocation(route: AppRoute, pathname = "/"): string {
  const search = buildAppRouteSearch(route);
  return `${pathname}${search}`;
}

export function routeEquals(a: AppRoute, b: AppRoute): boolean {
  return a.view === b.view && a.taskId === b.taskId && a.autoStartChat === b.autoStartChat;
}
