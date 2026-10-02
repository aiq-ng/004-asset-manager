import { Suspense } from "react";

import { CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/ui/pagination";
import { FilterBar, type FilterDefinition } from "@/features/shared/filter-bar";
import {
  RegisterAssetButtonFallback,
  RegisterAssetTrigger,
} from "@/features/assets/register-asset-trigger";
import {
  AssetEmptyState,
  AssetTable,
  AssetTableShell,
  AssetTableSkeleton,
  type AssetListItem,
} from "@/features/assets/asset-table";
import { ASSET_STATUSES, statusPresentation } from "@/features/assets/asset-status";
import {
  AssetSelectionProvider,
  LabelPrintBar,
} from "@/features/assets/asset-selection";
import { listAssetTypes } from "@/lib/services/asset-types";
import { listAssets, listMatchingAssetIds } from "@/lib/services/assets";
import { listStaff } from "@/lib/services/staff";
import { isAssignableTarget } from "@/features/staff/role-presentation";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";
import { queryFromSearchParams } from "@/lib/server/query";
import {
  buildHref,
  hasActiveFilters,
  normalizeSearchParams,
} from "@/lib/utils/search-params";
import { listAssetsQuerySchema } from "@/lib/validators/asset";

/**
 * Asset register.
 *
 * A Server Component throughout. The list is fetched here, but it is passed to
 * `AssetResults` as a promise and awaited inside a Suspense boundary, so the
 * header and filter bar paint immediately while the rows stream in.
 */
export default async function AssetsPage({ searchParams }: PageProps<"/assets">) {
  const actor = await requirePageActor();
  const params = await searchParams;
  const query = await queryFromSearchParams(listAssetsQuerySchema, Promise.resolve(params));
  // Flattened, empty-stripped view of the query string for filter controls and links.
  const current = normalizeSearchParams(params);

  // Started here, awaited further down: these round trips overlap the header
  // render instead of following it.
  const assetTypes = listAssetTypes();
  // Everyone gets the holder list, because the "Holder" filter is a filter and
  // not an action: hiding it from users who cannot assign would leave them with
  // no way to answer "what is Ana holding?". Only the assign dialog narrows it.
  const staff = listStaff({ page: 1, pageSize: 100 });
  const results = listAssets(query);
  // Overlaps the list read rather than following it, and is only asset numbers.
  // "Select all" has to reach across pages or a hundred laptops would still mean
  // ticking through five of them by hand.
  const matchingIds = listMatchingAssetIds(query);

  return (
    <>
      <PageHeader
        title="Assets"
        description="Everything on the register, with live status and who is holding it."
        actions={
          can(actor.role, "asset:manage") ? (
            <Suspense fallback={<RegisterAssetButtonFallback />}>
              <RegisterAssetTrigger assetTypes={assetTypes} />
            </Suspense>
          ) : null
        }
      />

      <div className="flex flex-col gap-c54-gap">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar
            current={current}
            placeholder="Search id, serial or description"
            selects={await filterDefinitions(assetTypes, staff, current)}
          />
        </Suspense>

        <Suspense fallback={<AssetTableSkeleton />}>
          <AssetResults
            matchingIds={matchingIds}
            results={results}
            permissions={{
              canManage: can(actor.role, "asset:manage"),
              canAssign: can(actor.role, "assignment:create"),
              canUpdateStatus: can(actor.role, "asset:updateStatus"),
            }}
            actor={{ id: actor.id, role: actor.role }}
            staff={staff}
            basePath="/assets"
            current={current}
          />
        </Suspense>
      </div>
    </>
  );
}

async function filterDefinitions(
  assetTypes: Promise<Awaited<ReturnType<typeof listAssetTypes>>>,
  staff: Promise<Awaited<ReturnType<typeof listStaff>>>,
  params: Record<string, string>,
): Promise<FilterDefinition[]> {
  const [types, holders] = await Promise.all([assetTypes, staff]);

  return [
    {
      name: "status",
      label: "Status",
      value: params.status ?? "",
      options: [
        { value: "", label: "Any status" },
        ...ASSET_STATUSES.map((status) => ({
          value: status,
          label: statusPresentation(status).label,
        })),
      ],
    },
    {
      name: "type",
      label: "Type",
      value: params.type ?? "",
      options: [
        { value: "", label: "Any type" },
        ...types.map((type) => ({ value: type.id, label: type.name })),
      ],
    },
    {
      name: "assignedTo",
      label: "Holder",
      value: params.assignedTo ?? "",
      // Every role, including SUPERADMIN: the service matches on an active
      // assignment and admins may hold assets, so hiding a role here would make
      // their assets unfilterable.
      options: [
        { value: "", label: "Anyone" },
        ...holders.items.map((person) => ({
          value: person.id,
          label: `${person.name} — ${person.department}`,
        })),
      ],
    },
  ];
}

/**
 * Resolves the rows, then renders the table or an empty state.
 *
 * Split out so the `<Suspense>` boundary sits around the database read rather
 * than around the whole page.
 */
async function AssetResults({
  matchingIds,
  results,
  permissions,
  actor,
  staff,
  basePath,
  current,
}: {
  matchingIds: Promise<string[]>;
  results: Promise<Awaited<ReturnType<typeof listAssets>>>;
  permissions: { canManage: boolean; canAssign: boolean; canUpdateStatus: boolean };
  actor: { id: string; role: string };
  staff: Promise<Awaited<ReturnType<typeof listStaff>>>;
  basePath: string;
  current: Record<string, string>;
}) {
  const { items, total, page, pageSize } = await results;
  const now = new Date();

  // The raw list is for the dialog only; the Holder filter is built separately
  // above. Narrowing here means an assigner is never offered themselves or a
  // superadmin, so the picker cannot present a choice the service will reject.
  const allStaff = (await staff).items;
  const candidates = permissions.canAssign
    ? allStaff.filter((person) => isAssignableTarget(actor, person))
    : undefined;

  if (items.length === 0) {
    return <AssetEmptyState filtered={hasActiveFilters(current)} />;
  }

  // Selection lives above the table so the rows can stay Server Components; only
  // the checkboxes and the bar are client islands.
  const matching = await matchingIds;

  return (
    <AssetSelectionProvider matching={matching}>
      <AssetTableShell>
        <AssetTable
          assets={items as AssetListItem[]}
          {...permissions}
          staff={candidates}
          now={now}
        />

        {total > pageSize ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            buildHref={(next) => buildHref(basePath, { ...current, page: next > 1 ? next : undefined })}
          />
        ) : (
          <CountFooter count={items.length} total={total} />
        )}

        <LabelPrintBar />
      </AssetTableShell>
    </AssetSelectionProvider>
  );
}

function CountFooter({ count, total }: { count: number; total: number }) {
  return (
    <CardContent className="border-t border-c54-border-default px-c54-pad-lg py-c54-3">
      <p className="text-c54-xs text-c54-text-secondary">
        {count === total ? (
          <>
            <span className="font-c54-mono text-c54-text-primary">{total}</span>{" "}
            {total === 1 ? "asset" : "assets"}
          </>
        ) : (
          <>
            Showing <span className="font-c54-mono text-c54-text-primary">{count}</span> of{" "}
            <span className="font-c54-mono text-c54-text-primary">{total}</span>
          </>
        )}
      </p>
    </CardContent>
  );
}