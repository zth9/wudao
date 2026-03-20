import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key === "dashboard.welcome_user" ? `dashboard.welcome_user:${String(options?.name ?? "")}` : key,
  }),
}));

vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { user: { nickname: string; avatar: string } }) => unknown) =>
    selector({ user: { nickname: "Tian", avatar: "" } }),
}));

import DashboardView from "./DashboardView";

describe("DashboardView", () => {
  it("首页不再渲染专业提示卡片", () => {
    const html = renderToStaticMarkup(
      createElement(DashboardView, {
        onNavigate: () => undefined,
      }),
    );

    expect(html).not.toContain("dashboard.pro_tip_title");
    expect(html).not.toContain("dashboard.pro_tip_desc");
  });
});
