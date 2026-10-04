import {
  ok,
  parseOrThrow,
  paginationMeta,
  permissionRoute,
  searchParamsToObject,
} from "@/lib/api";
import { auditActionCounts, listAuditLogs } from "@/lib/services/audit";
import { getAuditQueueHealth } from "@/lib/audit/health";
import { listAuditLogsQuerySchema } from "@/lib/validators/audit";

/**
 * The audit trail, newest first. `SUPERADMIN` only: rows carry actor emails and
 * client IP addresses, so the people being audited must not be able to read
 * their own entries. Reading the trail is itself audited.
 *
 * Filters: `action`, `entityType`, `entityId`, `q` (summary/actor search),
 * `from`, `to`, plus the usual `page`/`pageSize`. `meta.actions` holds the
 * per-action totals so a UI can render a filter bar without a second request.
 * `meta.worker` reports whether the worker that writes these rows is alive and
 * how many events are still queued, so a consumer can tell an empty trail from
 * an undelivered one.
 */
export const GET = permissionRoute("audit:read", async (request) => {
  const query = parseOrThrow(
    listAuditLogsQuerySchema,
    searchParamsToObject(request.nextUrl.searchParams),
  );

  const [{ items, total, page, pageSize }, actions, worker] = await Promise.all([
    listAuditLogs(query),
    auditActionCounts(),
    getAuditQueueHealth(),
  ]);

  return ok(items, { ...paginationMeta(page, pageSize, total), actions, worker });
});