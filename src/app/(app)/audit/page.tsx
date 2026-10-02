import { Suspense } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/features/shared/filter-bar";
import { AuditChanges } from "@/features/audit/audit-changes";
import { actionPresentation, entityHref, humanize } from "@/features/audit/audit-presentation";
import { listAuditLogs } from "@/lib/services/audit";
import { requirePagePermission } from "@/lib/server/guard";
import { queryFromSearchParams } from "@/lib/server/query";
import { buildHref, hasActiveFilters, normalizeSearchParams } from "@/lib/utils/search-params";
import { formatDateTime, formatRelative } from "@/lib/utils/format";
import { listAuditLogsQuerySchema } from "@/lib/validators/audit";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/events";

/**
 * Audit trail.
 *
 * Read-only by design: there is no mutation here, because the audit log is the
 * record of what everybody else did. Gated on `audit:read`.
 */
export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requirePagePermission("audit:read");
  const current = normalizeSearchParams(await searchParams);
  const query = await queryFromSearchParams(listAuditLogsQuerySchema, Promise.resolve(current));

  const results = listAuditLogs(query);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every state change, with who did it, from where, and what changed."
      />

      <div className="flex flex-col gap-c54-gap">
        <FilterBar
          current={current}
          placeholder="Search summary, actor name or email"
          selects={[
            {
              name: "entityType",
              label: "Entity",
              value: current.entityType ?? "",
              options: [
                { value: "", label: "Any entity" },
                ...AUDIT_ENTITY_TYPES.map((type) => ({ value: type, label: humanize(type) })),
              ],
            },
            {
              name: "action",
              label: "Action",
              value: current.action ?? "",
              options: [
                { value: "", label: "Any action" },
                ...Object.values(AUDIT_ACTIONS).map((action) => ({
                  value: action,
                  label: actionPresentation(action).label,
                })),
              ],
            },
          ]}
        />

        <Suspense fallback={<div className="h-40" />}>
          <AuditResults results={results} current={current} now={now} />
        </Suspense>
      </div>
    </>
  );
}

async function AuditResults({
  results,
  current,
  now,
}: {
  results: Promise<Awaited<ReturnType<typeof listAuditLogs>>>;
  current: Record<string, string>;
  now: Date;
}) {
  const { items, total, page, pageSize } = await results;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icons.Clipboard className="size-5" />}
          title={hasActiveFilters(current) ? "No events match those filters" : "No events yet"}
          description={
            hasActiveFilters(current)
              ? "Widen the date range, or clear the filters."
              : "Sign-ins and every asset change will appear here."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-c54-4">
      <Card className="divide-y divide-c54-border-default">
        {items.map((entry) => {
          const presentation = actionPresentation(entry.action);

          return (
            <article key={entry.id} className="px-c54-pad-lg py-c54-4">
              <div className="flex flex-wrap items-start justify-between gap-c54-3">
                <div className="flex min-w-0 items-start gap-c54-3">
                  <Badge tone={presentation.tone} dot className="mt-0.5 shrink-0">
                    {presentation.label}
                  </Badge>
                  <div className="min-w-0">
                    {(() => {
                      const href = entityHref(entry.entityType, entry.entityId);
                      return href ? (
                        <Link
                          href={href}
                          className="text-c54-sm text-c54-text-primary underline-offset-2 hover:text-c54-text-accent hover:underline"
                        >
                          {entry.summary}
                        </Link>
                      ) : (
                        <p className="text-c54-sm text-c54-text-primary">{entry.summary}</p>
                      );
                    })()}
                    <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
                      <span className="font-c54-mono">{entry.actor.email ?? "system"}</span>
                      {entry.actor.role ? (
                        <span className="ml-c54-2">{humanize(entry.actor.role)}</span>
                      ) : null}
                      {entry.ipAddress ? (
                        <span className="ml-c54-2 font-c54-mono">{entry.ipAddress}</span>
                      ) : null}
                      {!entry.actor.exists ? (
                        <span className="ml-c54-2 text-c54-text-warning">(account deleted)</span>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <time
                    dateTime={entry.occurredAt}
                    title={formatDateTime(entry.occurredAt)}
                    className="block text-c54-2xs text-c54-text-secondary"
                  >
                    {formatRelative(entry.occurredAt, now)}
                  </time>
                  <span className="mt-c54-1 block text-c54-2xs text-c54-text-muted">
                    {humanize(entry.entityType)}
                  </span>
                </div>
              </div>

              <AuditChanges changes={entry.changes} />
            </article>
          );
        })}
      </Card>

      {total > pageSize ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          buildHref={(next) => buildHref("/audit", { ...current, page: next > 1 ? next : undefined })}
        />
      ) : (
        <p className="text-c54-xs text-c54-text-muted">
          Showing all {total} {total === 1 ? "event" : "events"}.
        </p>
      )}
    </div>
  );
}