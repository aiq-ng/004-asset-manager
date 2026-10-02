/**
 * Formatters shared by the UI.
 *
 * Every function is deterministic for a given input: dates are formatted in UTC
 * and nothing reads the ambient clock unless the caller passes it in. That is
 * what makes them safe to call during SSR — a value that differed between the
 * server render and hydration would be a mismatch.
 */

const dateTimeCache = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let format = dateTimeCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options });
    dateTimeCache.set(key, format);
  }
  return format;
}

/** `2026-10-01` — stable, timezone-pinned so SSR and hydration agree. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormat({ year: "numeric", month: "short", day: "2-digit" }).format(date);
}

/** `01 Oct 2026, 16:16` */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormat({
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Whole days between two instants, never negative.
 *
 * `to` is required on purpose: defaulting it to `new Date()` would make the
 * result differ between the server render and hydration.
 */
export function daysBetween(from: string | Date, to: string | Date): number {
  const start = typeof from === "string" ? new Date(from) : from;
  const end = typeof to === "string" ? new Date(to) : to;
  const ms = end.getTime() - start.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

/**
 * `just now`, `4h ago`, `12 Mar` — a compact relative stamp.
 *
 * `now` is required for the same reason as above. See `RelativeTime` for the
 * component that upgrades an absolute stamp to a relative one after mounting.
 */
export function formatRelative(value: string | Date | null | undefined, now: Date): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d ago`;
  return formatDate(date);
}

const numberCache = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = numberCache.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-GB", options);
    numberCache.set(key, format);
  }
  return format;
}

export function formatNumber(value: number): string {
  return numberFormat({}).format(value);
}

export function formatCompactNumber(value: number): string {
  return value < 10_000 ? formatNumber(value) : numberFormat({ notation: "compact" }).format(value);
}

/** `24` -> `24 units`, `1` -> `1 unit`. */
export function formatUnit(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? "unit" : "units"}`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
