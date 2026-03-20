import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "zh" },
  }),
}));

import { ProviderSelector } from "./TaskListView";

describe("ProviderSelector", () => {
  it("在暗黑模式下为供应商名称声明浅色文本类", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderSelector, {
        providers: [
          { id: "openai", name: "OpenAI", model: "gpt-5", is_default: 1 },
          { id: "anthropic", name: "Anthropic", model: "claude-sonnet-4", is_default: 0 },
        ],
        selectedProviderId: "openai",
        onSelect: () => undefined,
      })
    );

    expect(html).toContain("text-foreground dark:text-foreground-dark");
  });

  it("为默认供应商渲染状态徽标", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderSelector, {
        providers: [
          { id: "openai", name: "OpenAI", model: "gpt-5", is_default: 1 },
          { id: "anthropic", name: "Anthropic", model: "claude-sonnet-4", is_default: 0 },
        ],
        selectedProviderId: "anthropic",
        onSelect: () => undefined,
      })
    );

    expect(html).toContain("provider_status.default");
  });

  it("在模型为空时回退显示 provider id", () => {
    const html = renderToStaticMarkup(
      createElement(ProviderSelector, {
        providers: [
          { id: "openai", name: "OpenAI", model: "", is_default: 1 },
        ],
        selectedProviderId: "openai",
        onSelect: () => undefined,
      })
    );

    expect(html).toContain(">openai<");
  });
});
