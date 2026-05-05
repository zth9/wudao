import { describe, expect, it } from "vitest";
import { buildAppLocation, buildAppRouteSearch, parseAppRoute, resolveViewChange, routeEquals } from "./app-route";

describe("app-route", () => {
  it("defaults to dashboard route", () => {
    expect(parseAppRoute("")).toEqual({ view: "dashboard", taskId: null, autoStartChat: false });
  });

  it("parses explicit view params", () => {
    expect(parseAppRoute("?view=settings")).toEqual({ view: "settings", taskId: null, autoStartChat: false });
    expect(parseAppRoute("?view=tasks")).toEqual({ view: "tasks", taskId: null, autoStartChat: false });
    expect(parseAppRoute("?view=memories")).toEqual({ view: "memories", taskId: null, autoStartChat: false });
  });

  it("treats bare taskId as task route", () => {
    expect(parseAppRoute("?taskId=2026-03-06-1")).toEqual({
      view: "tasks",
      taskId: "2026-03-06-1",
      autoStartChat: false,
    });
  });

  it("parses autoStartChat flag only for concrete task routes", () => {
    expect(parseAppRoute("?view=tasks&taskId=2026-03-06-1&autoStartChat=1")).toEqual({
      view: "tasks",
      taskId: "2026-03-06-1",
      autoStartChat: true,
    });
    expect(parseAppRoute("?view=tasks&autoStartChat=1")).toEqual({
      view: "tasks",
      taskId: null,
      autoStartChat: false,
    });
  });

  it("builds stable query strings", () => {
    expect(buildAppRouteSearch({ view: "dashboard", taskId: null, autoStartChat: false })).toBe("");
    expect(buildAppRouteSearch({ view: "tasks", taskId: null, autoStartChat: false })).toBe("?view=tasks");
    expect(buildAppRouteSearch({ view: "memories", taskId: null, autoStartChat: false })).toBe("?view=memories");
    expect(buildAppRouteSearch({ view: "tasks", taskId: "2026-03-06-1", autoStartChat: false })).toBe("?view=tasks&taskId=2026-03-06-1");
    expect(buildAppRouteSearch({ view: "tasks", taskId: "2026-03-06-1", autoStartChat: true })).toBe("?view=tasks&taskId=2026-03-06-1&autoStartChat=1");
    expect(buildAppLocation({ view: "settings", taskId: null, autoStartChat: false }, "/app")).toBe("/app?view=settings");
  });

  it("compares routes structurally", () => {
    expect(routeEquals(
      { view: "tasks", taskId: "a", autoStartChat: false },
      { view: "tasks", taskId: "a", autoStartChat: false },
    )).toBe(true);
    expect(routeEquals(
      { view: "tasks", taskId: "a", autoStartChat: false },
      { view: "tasks", taskId: null, autoStartChat: false },
    )).toBe(false);
  });
});

describe("resolveViewChange", () => {
  const taskListRoute = { view: "tasks", taskId: null, autoStartChat: false } as const;
  const taskDetailRoute = { view: "tasks", taskId: "a", autoStartChat: false } as const;
  const memoriesRoute = { view: "memories", taskId: null, autoStartChat: false } as const;

  it("从任务列表切到其他菜单时丢弃 taskId", () => {
    expect(resolveViewChange({
      currentRoute: taskListRoute,
      lastTaskCenterTaskId: null,
      targetView: "memories",
    })).toEqual({ view: "memories", taskId: null, autoStartChat: false });
  });

  it("从任务详情切到其他菜单时丢弃 taskId", () => {
    expect(resolveViewChange({
      currentRoute: taskDetailRoute,
      lastTaskCenterTaskId: "a",
      targetView: "settings",
    })).toEqual({ view: "settings", taskId: null, autoStartChat: false });
  });

  it("当任务中心最后停留在列表时，从其他菜单切回 tasks 应保持列表", () => {
    expect(resolveViewChange({
      currentRoute: memoriesRoute,
      lastTaskCenterTaskId: null,
      targetView: "tasks",
    })).toEqual({ view: "tasks", taskId: null, autoStartChat: false });
  });

  it("当任务中心最后停留在详情页时，从其他菜单切回 tasks 应回到详情页", () => {
    expect(resolveViewChange({
      currentRoute: memoriesRoute,
      lastTaskCenterTaskId: "a",
      targetView: "tasks",
    })).toEqual({ view: "tasks", taskId: "a", autoStartChat: false });
  });

  it("当前已在任务详情页且再次点击 tasks 菜单时保持详情页", () => {
    expect(resolveViewChange({
      currentRoute: taskDetailRoute,
      lastTaskCenterTaskId: "a",
      targetView: "tasks",
    })).toEqual({ view: "tasks", taskId: "a", autoStartChat: false });
  });

  it("autoStartChat 在切换菜单后总是被清除", () => {
    expect(resolveViewChange({
      currentRoute: { view: "tasks", taskId: "a", autoStartChat: true },
      lastTaskCenterTaskId: "a",
      targetView: "tasks",
    })).toEqual({ view: "tasks", taskId: "a", autoStartChat: false });
  });
});
