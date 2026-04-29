import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DefaultProviderToggle } from "./SettingsView";

describe("DefaultProviderToggle", () => {
  it("在未选中时为暗黑模式声明更清晰的文字和边框样式", () => {
    const html = renderToStaticMarkup(
      createElement(DefaultProviderToggle, {
        checked: false,
        label: "设为默认供应商",
        onChange: () => undefined,
      }),
    );

    expect(html).toContain("text-foreground");
    expect(html).toContain("border-border");
    expect(html).toContain("bg-default");
  });
});
