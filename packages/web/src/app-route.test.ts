import { describe, expect, it } from "vitest";
import { buildAppLocation, buildAppRouteSearch, parseAppRoute, routeEquals } from "./app-route";

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
