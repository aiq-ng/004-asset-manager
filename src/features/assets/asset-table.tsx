import Link from "next/link";

import { Badge, CodeChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { statusPresentation } from "@/features/assets/asset-status";
import { AssetRowActions } from "@/features/assets/asset-row-actions";
import {
  AssetSelectAllCheckbox,
  AssetSelectCheckbox,
} from "@/features/assets/asset-selection";
import type { StaffListOption } from "@/features/staff/types";
import { formatRelative } from "@/lib/utils/format";

/**
 * Asset rows.
 *
 * A Server Component: the data is already resolved by the page, and only the
 * per-row action menu is a client island. On a phone the table gives way to a
 * stacked list rather than forcing a horizontal scroll through five columns.
 */
export interface AssetListItem {
  id: string;
  assetId: string;
  description: string;
  brand: string | null;
  status: string;
  serialNumber: string | null;
  unit: number;
  assetType: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string; department: string } | null;
  createdAt: string;
}

export function AssetTable({
  assets,
  canManage,
  canAssign,
  canUpdateStatus,
  now,
  staff,
}: {
  assets: AssetListItem[];
  canManage: boolean;
  canAssign: boolean;
  canUpdateStatus: boolean;
  now: Date;
  staff?: StaffListOption[];
}) {
  return (
    <>
      {/* Desktop: dense grid. */}
      <div className="hidden md:block">
        <Table sticky>
          <thead>
            <TableRow>
              <TableHeader className="w-10">
                <AssetSelectAllCheckbox />
              </TableHeader>
              <TableHeader className="w-44">Asset ID</TableHeader>
              <TableHeader>Description</TableHeader>
              <TableHeader className="w-32">Type</TableHeader>
              <TableHeader className="w-36">Serial No.</TableHeader>
              <TableHeader className="w-36">Status</TableHeader>
              <TableHeader className="w-48">Assigned to</TableHeader>
              <TableHeader className="w-32">Added</TableHeader>
              <TableHeader className="w-12">
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableRow>
          </thead>
          <TableBody>
            {assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <AssetSelectCheckbox assetId={asset.assetId} />
                </TableCell>
                <TableCell>
                  <Link href={`/assets/${asset.assetId}`} className="hover:underline">
                    <CodeChip>{asset.assetId}</CodeChip>
                  </Link>
                </TableCell>
<TableCell className="max-w-80">
                <Link href={`/assets/${asset.assetId}`} className="block truncate font-c54-medium">
                  {asset.description}
                </Link>
              </TableCell>
              <TableCell>{asset.serialNumber ?? '—'}</TableCell>
                <TableCell className="text-c54-xs text-c54-text-secondary">{asset.assetType.name}</TableCell>
                <TableCell>
                  <StatusBadge status={asset.status} />
                </TableCell>
                <TableCell className="text-c54-xs">
                  {asset.assignedTo ? (
                    <span className="block truncate">{asset.assignedTo.name}</span>
                  ) : (
                    <span className="text-c54-text-muted">—</span>
                  )}
                </TableCell>
                <TableCell className="text-c54-2xs text-c54-text-muted">
                  {formatRelative(asset.createdAt, now)}
                </TableCell>
                <TableCell>
                  <AssetRowActions
                    assetId={asset.assetId}
                    status={asset.status}
                    assigned={Boolean(asset.assignedTo)}
                    canManage={canManage}
                    canAssign={canAssign}
                    canUpdateStatus={canUpdateStatus}
                    staff={staff}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: one card per asset. */}
      <ul className="divide-y divide-c54-border-default md:hidden">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-start gap-c54-3 px-c54-pad-lg py-c54-3">
            <div className="pt-c54-1">
              <AssetSelectCheckbox assetId={asset.assetId} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-c54-2">
                <CodeChip>{asset.assetId}</CodeChip>
                <StatusBadge status={asset.status} size="sm" />
              </div>
              <Link href={`/assets/${asset.assetId}`} className="mt-c54-2 block text-c54-sm font-c54-medium">
                {asset.description}
              </Link>
              <p className="mt-c54-1 text-c54-2xs text-c54-text-muted">
                {asset.assetType.name}
                {asset.assignedTo ? ` · ${asset.assignedTo.name}` : ""}
              </p>
            </div>
            <AssetRowActions
              assetId={asset.assetId}
              status={asset.status}
              assigned={Boolean(asset.assignedTo)}
              canManage={canManage}
              canAssign={canAssign}
              canUpdateStatus={canUpdateStatus}
              staff={staff}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export function StatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const presentation = statusPresentation(status);

  return (
    <Badge tone={presentation.tone} dot size={size} title={presentation.hint}>
      {presentation.label}
    </Badge>
  );
}

export function AssetTableShell({ children }: { children: React.ReactNode }) {
  return <Card className="overflow-hidden">{children}</Card>;
}

export function AssetEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card>
      <EmptyState
        icon={<Icons.Inbox className="size-5" />}
        title={filtered ? "No assets match those filters" : "No assets registered yet"}
        description={
          filtered
            ? "Try a different search term, or clear the filters to see everything."
            : "Register the first asset to start tracking the register."
        }
        action={
          filtered ? (
            <Link href="/assets">
              <Button variant="outline" size="sm">
                Clear filters
              </Button>
            </Link>
          ) : null
        }
      />
    </Card>
  );
}

export function AssetTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-c54-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-c54-3">
            <div className="h-3 w-32 rounded-c54-sm bg-c54-bg-muted" />
            <div className="h-3 flex-1 rounded-c54-sm bg-c54-bg-muted" />
            <div className="h-3 w-20 rounded-c54-sm bg-c54-bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}