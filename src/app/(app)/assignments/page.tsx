import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar } from "@/features/shared/filter-bar";
import {
  AssignmentEmptyState,
  AssignmentTable,
  type AssignmentListItem,
} from "@/features/assignments/assignment-table";
import { listAssignments } from "@/lib/services/assignments";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";
import { queryFromSearchParams } from "@/lib/server/query";
import { buildHref, hasActiveFilters, normalizeSearchParams } from "@/lib/utils/search-params";
import { listAssignmentsQuerySchema } from "@/lib/validators/assignment";

/**
 * Assignment register.
 *
 * The same shape as the asset list: Server Component, query-string filters, and a
 * `<Suspense>` boundary around the rows so the header paints while the database
 * read is still in flight.
 */
export default async function AssignmentsPage({ searchParams }: PageProps<"/assignments">) {
  const actor = await requirePageActor();
  const current = normalizeSearchParams(await searchParams);
  const query = await queryFromSearchParams(listAssignmentsQuerySchema, Promise.resolve(current));

  const results = listAssignments(query);
  const active = query.active;
  const currentActive = active === undefined ? "" : String(active);

  return (
    <>
      <PageHeader
        title="Assignments"
        description="Who is holding what, and when it came back."
      />

      <div className="flex flex-col gap-c54-gap">
        <FilterBar
          current={current}
          placeholder="Search asset or holder"
          selects={[
            {
              name: "active",
              label: "State",
              value: currentActive,
              options: [
                { value: "", label: "All assignments" },
                { value: "true", label: "Currently out" },
                { value: "false", label: "Returned" },
              ],
            },
          ]}
        />

        <Suspense fallback={<div className="h-40" />}>
          <AssignmentResults
            results={results}
            canReturn={can(actor.role, "assignment:return")}
            current={current}
            filtered={hasActiveFilters(current)}
          />
        </Suspense>
      </div>
    </>
  );
}

async function AssignmentResults({
  results,
  canReturn,
  current,
  filtered,
}: {
  results: Promise<Awaited<ReturnType<typeof listAssignments>>>;
  canReturn: boolean;
  current: Record<string, string>;
  filtered: boolean;
}) {
  const { items, total, page, pageSize } = await results;

  if (items.length === 0) {
    return <AssignmentEmptyState filtered={filtered} />;
  }

  return (
    <div className="flex flex-col gap-c54-4">
      <div className="overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card">
        <AssignmentTable assignments={items as AssignmentListItem[]} canReturn={canReturn} />
      </div>

      {total > pageSize ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          buildHref={(next) => buildHref("/assignments", { ...current, page: next > 1 ? next : undefined })}
        />
      ) : (
        <p className="text-c54-xs text-c54-text-muted">
          Showing all {total} {total === 1 ? "assignment" : "assignments"}.
        </p>
      )}
    </div>
  );
}