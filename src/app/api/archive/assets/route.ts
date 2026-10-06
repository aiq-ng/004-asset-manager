import type { NextRequest } from "next/server";

import { ok, paginationMeta, parseOrThrow, permissionRoute, searchParamsToObject } from "@/lib/api";
import { listArchivedAssets } from "@/lib/services/assets";
import { listArchivedAssetsQuerySchema } from "@/lib/validators/asset";

/**
 * The archive, as a list of records taken off the register.
 *
 * Read-only by design: there is no DELETE here. Archiving exists to make a
 * mistake recoverable by the people who can see it, and a second way to destroy
 * the same rows would put the register's own history back outside its controls.
 *
 * `archive:read` is ADMIN and up. The route is wrapped rather than relying on the
 * page guard, because the page guard only protects the page: without this,
 * anybody signed in could read the archive straight out of the API.
 */
export const GET = permissionRoute("archive:read", async (request: NextRequest) => {
  const query = parseOrThrow(
    listArchivedAssetsQuerySchema,
    searchParamsToObject(request.nextUrl.searchParams),
  );
  const { items, total, page, pageSize } = await listArchivedAssets(query);

  return ok(items, paginationMeta(page, pageSize, total));
});