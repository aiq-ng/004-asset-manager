/**
 * Query-string helpers.
 *
 * Every list screen in the app is driven entirely by the URL, so filters,
 * pagination and sort state are shareable, bookmarkable and back-button safe.
 * These helpers keep the string building in one place — and critically, they
 * preserve unrelated params, so paging a filtered list does not silently reset
 * the filter.
 */

export type ParamValue = string | number | null | undefined | false;
export type ParamRecord = Record<string, ParamValue>;

/** A single string, or undefined — Next hands searchParams over as a Promise. */
export type SearchParamsInput = Record<string, string | string[] | undefined>;

/** Normalises Next's `searchParams` into a plain, first-value-wins object. */
export function normalizeSearchParams(input: SearchParamsInput | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input) return result;

  for (const [key, value] of Object.entries(input)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single !== "") result[key] = single;
  }

  return result;
}

function appendParam(params: URLSearchParams, key: string, value: ParamValue) {
  if (value === null || value === undefined || value === false || value === "") return;
  params.set(key, String(value));
}

/**
 * Builds a query string from a record. Returns `""` (not `"?")` when empty so
 * the clean URL is the default and the app has one canonical form per state.
 */
export function buildQuery(input: ParamRecord): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) appendParam(params, key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `buildHref("/assets", { q: "laptop", page: 2 })` -> `/assets?q=laptop&page=2`. */
export function buildHref(pathname: string, input: ParamRecord): string {
  return `${pathname}${buildQuery(input)}`;
}

/** Replaces one param, leaving the rest untouched. */
export function withParam(
  current: ParamRecord,
  key: string,
  value: ParamValue,
): ParamRecord {
  const next: ParamRecord = { ...current };
  if (value === null || value === undefined || value === false || value === "") delete next[key];
  else next[key] = value;
  return next;
}

/**
 * Sets a param and resets paging, because a changed filter invalidates the
 * current offset. Forgetting this is the classic "page 7 of a new, shorter
 * result set" bug.
 */
export function withFilter(current: ParamRecord, key: string, value: ParamValue): ParamRecord {
  return withParam(withParam(current, key, value), "page", undefined);
}

export function withoutParam(current: ParamRecord, key: string): ParamRecord {
  return withParam(current, key, undefined);
}

/** True when any param outside `page` is set — used to offer "Clear filters". */
export function hasActiveFilters(params: ParamRecord, ignored: string[] = ["page"]): boolean {
  return Object.entries(params).some(
    ([key, value]) => !ignored.includes(key) && value !== undefined && value !== null && value !== "",
  );
}

/** Coerces a query value to a positive integer, or null when unusable. */
export function intParam(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}
