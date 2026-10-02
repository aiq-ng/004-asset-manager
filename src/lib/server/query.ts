import "server-only";

import type { ZodType } from "zod";

import { parseQuery } from "@/lib/server/define-action";

/**
 * Bridges a page's `searchParams` Promise into a validated query object.
 *
 * Query strings are user input: a bookmarked URL, a stale link, or a hand-edited
 * value can all be nonsense. Parsing through the same schemas the REST routes use
 * means the list pages and the API accept the same inputs, and an invalid value
 * degrades to the default instead of throwing a 500 at the user.
 */
export async function queryFromSearchParams<TSchema extends ZodType>(
  schema: TSchema,
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<ReturnType<typeof parseQuery<TSchema>>> {
  return parseQuery(schema, normalize(await searchParams));
}

function normalize(input: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(input)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string" && single !== "") result[key] = single;
  }

  return result;
}