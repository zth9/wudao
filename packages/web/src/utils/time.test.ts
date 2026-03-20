import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  formatDateInDefaultTimeZone,
  formatDateTimeInDefaultTimeZone,
  formatLocalizedDateInDefaultTimeZone,
  isBeforeTodayInDefaultTimeZone,
} from "./time";

describe("web time helpers", () => {
  it("uses Asia/Shanghai as the default timezone", () => {
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Shanghai");
  });

  it("formats dates in Asia/Shanghai across UTC day boundaries", () => {
    expect(formatDateInDefaultTimeZone("2026-03-06T16:30:00.000Z")).toBe("2026-03-07");
  });

  it("formats date time in Asia/Shanghai", () => {
    expect(formatDateTimeInDefaultTimeZone("2026-03-06T16:30:05.000Z")).toBe("2026-03-07 00:30:05");
  });

  it("formats localized dates with the default timezone", () => {
    expect(formatLocalizedDateInDefaultTimeZone("2026-03-06T16:30:00.000Z", "zh-CN")).toBe("2026/03/07");
    expect(formatLocalizedDateInDefaultTimeZone("2026-03-06T16:30:00.000Z", "en-US")).toBe("03/07/2026");
  });

  it("compares due dates by Shanghai calendar day", () => {
    expect(isBeforeTodayInDefaultTimeZone("2026-03-06T15:59:59.000Z", "2026-03-07T16:00:00.000Z")).toBe(true);
    expect(isBeforeTodayInDefaultTimeZone("2026-03-07T16:00:00.000Z", "2026-03-07T16:00:00.000Z")).toBe(false);
  });
});
