import { Suspense } from "react";

import { Archive } from "lucide-react";

import { CodeChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/features/shared/filter-bar";
import { listArchivedAssets } from "@/lib/services/assets";
import { requirePagePermission } from "@/lib/server/guard";
import { queryFromSearchParams } from "@/lib/server/query";
import { buildHref, hasActiveFilters, normalizeSearchParams } from "@/lib/utils/search-params";
import { formatDateTime } from "@/lib/utils/format";
import { listArchivedAssetsQuerySchema } from "@/lib/validators/asset";

/**
 * The archive: asset records that were created by mistake and taken off the
 * register.
 *
 * Read-only, and that is the point rather than a missing feature. Archiving is
 * how a bad entry stops being somebody else's problem; once it is here, the
 * record and the audit event that put it here are the permanent record of the
 * mistake. Nothing on this page can put a row back or delete it, so the list can
 * never become a second, quieter way of destroying history.
 *
 * Gated by `archive:read` (ADMIN and up) with `requirePagePermission`, not by
 * hiding the nav entry: the guard is what makes typing the URL useless, which is
 * the same reason the REST route carries its own check.
 */
export default async function ArchivePage({ searchParams }: PageProps<"/archive">) {
  await requirePagePermission("archive:read");

  const params = await searchParams;
  const current = normalizeSearchParams(params);
  const query = await queryFromSearchParams(
    listArchivedAssetsQuerySchema,
    Promise.resolve(current),
  );

  const results = listArchivedAssets(query);

  return (
    <>
      <PageHeader
        title="Archive"
        description="Asset records taken off the register. Nothing here is on the register, in circulation, or assignable."
      />

      <div className="flex flex-col gap-c54-section">
        <FilterBar current={current} placeholder="Search asset id, serial, name, brand or model" />

        <Suspense fallback={<div className="h-40" />}>
          <ArchiveResults results={results} current={current} />
        </Suspense>
      </div>
    </>
  );
}

async function ArchiveResults({
  results,
  current,
}: {
  results: Promise<Awaited<ReturnType<typeof listArchivedAssets>>>;
  current: Record<string, string>;
}) {
  const { items, total, page, pageSize } = await results;

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Archive className="size-5" />}
          title={hasActiveFilters(current) ? "Nothing archived matches that search" : "The archive is empty"}
          description={
            hasActiveFilters(current)
              ? "Try a different asset id, serial or name."
              : "Records archived because they were created by mistake will appear here. Archiving an asset is not the same as retiring it: a retired device stays on the register."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-c54-4">
      <div className="overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card">
        <Table>
          <thead>
            <TableRow>
              <TableHeader className="w-40">Asset id</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader className="w-40">Type</TableHeader>
              <TableHeader className="w-48">Serial</TableHeader>
              <TableHeader className="w-40 whitespace-nowrap">Archived</TableHeader>
              <TableHeader className="w-40 whitespace-nowrap">By</TableHeader>
            </TableRow>
          </thead>
          <TableBody>
            {items.map((asset) => (
              <TableRow key={asset.id}>
                {/* Not a link. The detail page filters archived rows out and
                    answers 404 for them, so a link here would be a dead end
                    pretending to be a record. */}
                <TableCell>
                  <CodeChip>{asset.assetId}</CodeChip>
                </TableCell>
                <TableCell className="text-c54-sm">{asset.description}</TableCell>
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  {asset.assetType.name}
                </TableCell>
                <TableCell className="text-c54-xs whitespace-nowrap text-c54-text-secondary">
                  {asset.serialNumber ?? <span className="text-c54-text-muted">—</span>}
                </TableCell>
                <TableCell className="text-c54-xs whitespace-nowrap text-c54-text-secondary">
                  {formatDateTime(asset.archivedAt)}
                </TableCell>
                {/* Null when the account that archived it has since been
                    removed: the archive outlives the person who tidied it. */}
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  {asset.archivedBy ?? <span className="text-c54-text-muted">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {total > pageSize ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          buildHref={(next) => buildHref("/archive", { ...current, page: next > 1 ? next : undefined })}
        />
      ) : (
        <p className="text-c54-xs text-c54-text-muted">
          Showing all {total} archived {total === 1 ? "record" : "records"}.
        </p>
      )}
    </div>
  );
}