import Link from "next/link";
import { Tag } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CodeChip } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  AssetTypeCreateButton,
  AssetTypeRowActions,
  type AssetTypeRow,
} from "@/features/asset-types/asset-type-forms";
import { listAssetTypes } from "@/lib/services/asset-types";
import { wantsCreateSheet } from "@/features/shared/create-sheet-param";
import { formatAssetId } from "@/lib/services/asset-id";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Asset types.
 *
 * The code is the asset id prefix, so this page explains that consequence rather
 * than letting somebody discover it after creating two hundred laptops.
 */
export default async function AssetTypesPage({ searchParams }: PageProps<"/asset-types">) {
  const actor = await requirePageActor();
  const types = await listAssetTypes();
  const canManage = can(actor.role, "assetType:manage");
  // `/asset-types?new` opens the sheet directly, so the dashboard can link here
  // instead of to a route that does not exist.
  const openSheet = canManage && wantsCreateSheet(await searchParams);

  return (
    <>
      <PageHeader
        title="Asset types"
        description="Categories that drive the asset id prefix. Laptop becomes IT-LAP-0001."
        actions={canManage ? <AssetTypeCreateButton openInitially={openSheet} /> : null}
      />

      <div className="flex flex-col gap-c54-section">
        {types.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Tag className="size-5" />}
              title="No asset types yet"
              description="An asset type gives each asset its id prefix, so at least one is needed before anything can be registered."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <thead>
                <TableRow>
                  <TableHeader className="w-24">Code</TableHeader>
                  <TableHeader>Name</TableHeader>
                  <TableHeader className="w-28 text-right">Assets</TableHeader>
                  <TableHeader className="w-24">Example id</TableHeader>
                  {canManage ? <TableHeader className="w-28" /> : null}
                </TableRow>
              </thead>
              <TableBody>
                {types.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>
                      <CodeChip>{type.code}</CodeChip>
                    </TableCell>
                    <TableCell className="font-c54-medium">{type.name}</TableCell>
                    <TableCell className="text-right">
                      {type.assetCount === 0 ? (
                        <span className="text-c54-text-muted">—</span>
                      ) : (
                        <Link
                          href={`/assets?type=${type.id}`}
                          className="font-c54-mono text-c54-xs hover:underline"
                        >
                          {type.assetCount}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="font-c54-mono text-c54-2xs text-c54-text-muted">
                        {formatAssetId(type.code, 1)}
                      </code>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <AssetTypeRowActions assetType={type as AssetTypeRow} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}