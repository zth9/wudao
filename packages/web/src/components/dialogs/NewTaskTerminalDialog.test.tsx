import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../stores/terminalStore", () => ({
  generateTerminalName: () => "Workspace Terminal",
}));

import { NewTaskTerminalDialog } from "./NewTaskTerminalDialog";

describe("NewTaskTerminalDialog", () => {
  it("为默认供应商显示状态徽标", () => {
    const html = renderToStaticMarkup(
      createElement(NewTaskTerminalDialog, {
        providers: [
          { id: "claude", name: "Claude", model: "claude-opus-4-6", is_default: 1 },
          { id: "openai", name: "OpenAI", model: "gpt-5.3-codex", is_default: 0 },
        ],
        defaultProviderId: "claude",
        onConfirm: () => undefined,
        onCancel: () => undefined,
      })
    );

    expect(html).toContain("provider_status.default");
  });

  it("在模型为空时回退显示 provider id", () => {
    const html = renderToStaticMarkup(
      createElement(NewTaskTerminalDialog, {
        providers: [
          { id: "claude", name: "Claude", model: "", is_default: 1 },
        ],
        defaultProviderId: "claude",
        onConfirm: () => undefined,
        onCancel: () => undefined,
      })
    );

    expect(html).toContain(">claude<");
  });
});
