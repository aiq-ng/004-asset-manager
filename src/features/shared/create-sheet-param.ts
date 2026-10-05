/**
 * The one convention that lets a link open a create sheet.
 *
 * Every "add" form in the app is a dialog owned by a client button's own
 * `useState`, which meant no URL could ever reach one: the dashboard's quick
 * actions pointed at `/staff/new` and friends, which are not routes. `/assets/new`
 * was worse than a dead link — it matched `/assets/[assetId]` with the literal
 * `new`, so it rendered a 404 that looked like a missing asset.
 *
 * So the sheets are made linkable through a query flag on the page that already
 * hosts them — `/staff?new`, not a second route that duplicates the list. One
 * parameter, one meaning, four sheets.
 *
 * `new` rather than something like `action=create` because the flag opens one
 * specific thing on a page that has exactly one of them; the sheet it refers to
 * is unambiguous from the URL alone.
 */
export const CREATE_SHEET_PARAM = "new";

/**
 * Whether a page's query string asks for its create sheet to be open.
 *
 * Accepts the flag bare (`?new`) or with any affirmative value, and reads
 * `0`/`false` as "no" so a link can be written either way without surprising
 * anybody. Anything else present counts as yes, which is what makes `/staff?new`
 * work in a hand-typed URL.
 */
export function wantsCreateSheet(
  params: Record<string, string | string[] | undefined> | undefined,
): boolean {
  const raw = params?.[CREATE_SHEET_PARAM];
  if (raw === undefined) return false;

  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return value !== "0" && value !== "false";
}

/**
 * Drops the flag once the sheet is closed, so the address bar does not keep
 * promising a dialog that has gone.
 *
 * Uses `history.replaceState` rather than a router navigation on purpose. The
 * alternative re-renders the page, which would throw away the filters and the
 * scroll position the person had — and on `/assets` and `/staff` there are
 * filters in that same query string, which is why every other parameter is
 * carried over instead of being replaced.
 */
export function clearCreateSheetParam(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(CREATE_SHEET_PARAM)) return;

  url.searchParams.delete(CREATE_SHEET_PARAM);
  const query = url.searchParams.toString();
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  );
}
