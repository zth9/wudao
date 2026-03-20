import { describe, expect, it } from "vitest";
import { isImeComposing, shouldSubmitOnEnter } from "./ime";

describe("ime utils", () => {
  it("在普通 Enter 时允许提交", () => {
    expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: false })).toBe(true);
  });

  it("在 Shift + Enter 时不提交", () => {
    expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("在组合输入过程中不提交", () => {
    expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: true } })).toBe(false);
  });

  it("在组合状态 ref 仍为 true 时不提交", () => {
    expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: false }, true)).toBe(false);
  });

  it("兼容 keyCode 229 的输入法场景", () => {
    expect(isImeComposing({ key: "Enter", shiftKey: false, keyCode: 229 })).toBe(true);
    expect(shouldSubmitOnEnter({ key: "Enter", shiftKey: false, keyCode: 229 })).toBe(false);
  });
});
