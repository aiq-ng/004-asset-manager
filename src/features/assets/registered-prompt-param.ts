/**
 * The one convention that lets a URL ask for the post-registration label offer.
 *
 * `createAssetAction` redirects to the record it just created, which is what
 * stops a reload from resubmitting the form. That redirect also means the create
 * sheet never sees its own success — the client is thrown away and the new page
 * renders instead — so there is no moment at which a "would you like a label?"
 * dialog could be raised from inside the sheet without giving up the redirect.
 *
 * Rather than trade away the redirect for a nicer moment, the offer travels in the
 * query string: `/assets/IT-LAP-0007?registered=1`. One parameter, one meaning,
 * read by the same rule as `create-sheet-param` — a flag present with any
 * affirmative value, and `0`/`false` read as "no" so the URL can be written by
 * hand.
 *
 * Deliberately not a route of its own. `/assets/[assetId]` already exists and
 * already renders the signed-in asset page; a second route for "the same page,
 * with a dialog up" would duplicate it and the two would drift.
 */
export const REGISTERED_PROMPT_PARAM = "registered";

/**
 * Whether the URL is asking for the label offer to be shown.
 *
 * Takes the same shape as `wantsCreateSheet` so the two read identically at their
 * call sites.
 */
export function wantsRegisteredPrompt(
  params: Record<string, string | string[] | undefined> | undefined,
): boolean {
  const raw = params?.[REGISTERED_PROMPT_PARAM];
  if (raw === undefined) return false;

  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();
  return value !== "0" && value !== "false";
}

/**
 * Drops the flag once the offer is dismissed, so the address bar does not go on
 * promising a dialog that has gone — and so a reload, or coming back from
 * somewhere else, does not raise it again uninvited.
 *
 * `history.replaceState` rather than a router navigation, for the same reason as
 * `clearCreateSheetParam`: navigating would re-render the page underneath the
 * person who just closed a dialog, throwing away their scroll position for no
 * gain. Every other parameter is carried over rather than the query replaced
 * wholesale.
 */
export function clearRegisteredPromptParam(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(REGISTERED_PROMPT_PARAM)) return;

  url.searchParams.delete(REGISTERED_PROMPT_PARAM);
  const query = url.searchParams.toString();
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${query ? `?${query}` : ""}${url.hash}`,
  );
}