import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import {
  buildInitialTaskInfoMessage,
  isTaskChatScrolledNearBottom,
  shouldShowTaskChatScrollButton,
} from "./task-chat";

describe("task-chat utils", () => {
  it("builds initial task info message in Chinese by default", async () => {
    await i18n.changeLanguage("zh");
    expect(buildInitialTaskInfoMessage({
      title: "修复聊天",
      type: "bugfix",
      context: "创建后首轮自动对话",
    }, i18n.t.bind(i18n))).toContain("[任务信息]");
  });

  it("builds initial task info message in English", async () => {
    await i18n.changeLanguage("en");
    const message = buildInitialTaskInfoMessage({
      title: "Fix chat",
      type: "bugfix",
      context: "Restore the first planning turn",
    }, i18n.t.bind(i18n));

    expect(message).toContain("[Task Info]");
    expect(message).toContain("Type: 🐛 Bugfix");
    expect(message).toContain("Initial Intent: Restore the first planning turn");
  });

  it("falls back to localized none when context is empty", async () => {
    await i18n.changeLanguage("zh");
    expect(buildInitialTaskInfoMessage({
      title: "修复聊天",
      type: "bugfix",
      context: null,
    }, i18n.t.bind(i18n))).toContain("初步意图：无");
  });

  it("detects when scroll is near bottom", () => {
    expect(isTaskChatScrolledNearBottom({
      scrollTop: 396,
      clientHeight: 400,
      scrollHeight: 800,
    })).toBe(true);
  });

  it("detects when user has scrolled away from bottom", () => {
    expect(isTaskChatScrolledNearBottom({
      scrollTop: 320,
      clientHeight: 400,
      scrollHeight: 800,
    })).toBe(false);
  });

  it("shows the scroll-to-bottom button only when auto scroll is off and messages exist", () => {
    expect(shouldShowTaskChatScrollButton(false, 3)).toBe(true);
    expect(shouldShowTaskChatScrollButton(true, 3)).toBe(false);
    expect(shouldShowTaskChatScrollButton(false, 0)).toBe(false);
  });
});
