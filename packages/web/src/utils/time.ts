export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Missing date part: ${type}`);
  return value;
}

function toDate(dateInput: Date | string | number): Date {
  return dateInput instanceof Date ? dateInput : new Date(dateInput);
}

function formatParts(dateInput: Date | string | number) {
  const date = toDate(dateInput);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
}

function resolveLocale(language: string): string {
  return language.startsWith("zh") ? "zh-CN" : "en-US";
}

export function formatDateInDefaultTimeZone(dateInput: Date | string | number): string {
  const parts = formatParts(dateInput);
  return `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`;
}

export function formatDateTimeInDefaultTimeZone(dateInput: Date | string | number): string {
  const parts = formatParts(dateInput);
  return `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")} ${getPart(parts, "hour")}:${getPart(parts, "minute")}:${getPart(parts, "second")}`;
}

export function formatLocalizedDateInDefaultTimeZone(
  dateInput: Date | string | number,
  language: string,
): string {
  return new Intl.DateTimeFormat(resolveLocale(language), {
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(dateInput));
}

export function isBeforeTodayInDefaultTimeZone(
  dateInput: Date | string | number,
  now: Date | string | number = Date.now(),
): boolean {
  return formatDateInDefaultTimeZone(dateInput) < formatDateInDefaultTimeZone(now);
}
