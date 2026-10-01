import {
  ok,
  parseOrThrow,
  paginationMeta,
  permissionRoute,
  searchParamsToObject,
} from "@/lib/api";
import { auditActionCounts, listAuditLogs } from "@/lib/services/audit";
import { listAuditLogsQuerySchema } from "@/lib/validators/audit";

/**
 * The audit trail, newest first. `SUPERADMIN` only: rows carry actor emails and
 * client IP addresses, so the people being audited must not be able to read
 * their own entries. Reading the trail is itself audited.
 *
 * Filters: `action`, `entityType`, `entityId`, `q` (summary/actor search),
 * `from`, `to`, plus the usual `page`/`pageSize`. `meta.actions` holds the
 * per-action totals so a UI can render a filter bar without a second request.
 */
export const GET = permissionRoute("audit:read", async (request) => {
  const query = parseOrThrow(
    listAuditLogsQuerySchema,
    searchParamsToObject(request.nextUrl.searchParams),
  );

  const [{ items, total, page, pageSize }, actions] = await Promise.all([
    listAuditLogs(query),
    auditActionCounts(),
  ]);

  return ok(items, { ...paginationMeta(page, pageSize, total), actions });
});