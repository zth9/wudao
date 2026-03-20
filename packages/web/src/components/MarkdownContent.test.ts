import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarkdownContent from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders common markdown structures as html", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "# 标题\n\n- 列表项\n\n`code`\n\n| A | B |\n| - | - |\n| 1 | 2 |",
      })
    );

    expect(html).toContain("<h1");
    expect(html).toContain("标题</h1>");
    expect(html).toContain("<ul");
    expect(html).toContain("<code");
    expect(html).toContain("<table");
  });

  it("adds safe link attributes", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        content: "[OpenAI](https://openai.com)",
      })
    );

    expect(html).toContain('href="https://openai.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });
});
