import Link from "next/link";
import { Inbox } from "lucide-react";

import { Badge, CodeChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { statusPresentation } from "@/features/assets/asset-status";
import { AssetRowActions } from "@/features/assets/asset-row-actions";
import { AssetPasswordCell } from "@/features/assets/asset-password-cell";
import { AssetPinCell } from "@/features/assets/asset-pin-cell";
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
  model: string | null;
  status: string;
  serialNumber: string | null;
  assetType: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string; department: string } | null;
  /** Whether a device password is stored. Never the value itself. */
  hasDevicePassword: boolean;
  /** Whether a device PIN is stored. Never the value itself. */
  hasDevicePin: boolean;
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
              <TableHeader className="w-32">Brand</TableHeader>
              <TableHeader className="w-40">Model</TableHeader>
              <TableHeader className="w-32">Type</TableHeader>
              <TableHeader className="w-36">Serial No.</TableHeader>
              <TableHeader className="w-36">Status</TableHeader>
              <TableHeader className="w-48">Assigned to</TableHeader>
              {/* Only ever rendered for ADMIN and up: the columns are the one
                  place on a list page where a credential is a single click from
                  the screen, so the headers follow the same `asset:manage` gate
                  as the cells they label. */}
              {canManage ? <TableHeader className="w-56">Password</TableHeader> : null}
              {canManage ? <TableHeader className="w-36">PIN</TableHeader> : null}
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
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  <span className="block truncate">{asset.brand ?? "—"}</span>
                </TableCell>
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  <span className="block truncate">{asset.model ?? "—"}</span>
                </TableCell>
                {/* Type before Serial, matching the headers above: the widths are
                    sized for it (`Type` short, `Serial No.` wider), and swapping
                    the cells put every serial under a "Type" label. */}
                <TableCell className="text-c54-xs text-c54-text-secondary">
                  {asset.assetType.name}
                </TableCell>
                <TableCell>{asset.serialNumber ?? "—"}</TableCell>
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
                {/* Whole cell and whole header are both behind the gate, not just
                    the contents: an empty cell under a header nobody may use is a
                    column of blank space on the register for every non-admin. */}
                {canManage ? (
                  <TableCell>
                    <AssetPasswordCell
                      assetId={asset.assetId}
                      hasPassword={asset.hasDevicePassword}
                    />
                  </TableCell>
                ) : null}
                {canManage ? (
                  <TableCell>
                    <AssetPinCell assetId={asset.assetId} hasPin={asset.hasDevicePin} />
                  </TableCell>
                ) : null}
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
                {asset.brand || asset.model
                  ? ` · ${[asset.brand, asset.model].filter(Boolean).join(" ")}`
                  : ""}
                {asset.assignedTo ? ` · ${asset.assignedTo.name}` : ""}
              </p>
              {/* On a phone the desktop columns are gone, and the row menu is the
                  only other place an admin can reach a credential — but the
                  password and the PIN are the things people scan the register
                  *for*, so they ride along under the asset rather than behind a
                  menu. Labelled because there are two of them now, and two rows
                  of four-to-eight dots with no caption are indistinguishable. */}
              {canManage ? (
                <div className="mt-c54-2 flex flex-wrap gap-x-c54-4 gap-y-c54-2">
                  <div className="min-w-0">
                    <span className="block text-c54-2xs text-c54-text-muted">Password</span>
                    <AssetPasswordCell
                      assetId={asset.assetId}
                      hasPassword={asset.hasDevicePassword}
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-c54-2xs text-c54-text-muted">PIN</span>
                    <AssetPinCell assetId={asset.assetId} hasPin={asset.hasDevicePin} />
                  </div>
                </div>
              ) : null}
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

/**
 * Narrows a full `AssetDto` to what a register row actually renders.
 *
 * The row needs one fact about each device credential — whether it is stored —
 * and never either value, which live only behind `services/asset-passwords.ts`
 * and `services/asset-pins.ts`. Mapping rather than casting: the previous
 * `items as AssetListItem[]` was a promise that the service DTO and the row
 * shape had not drifted, made without any check, and this is the line that breaks
 * if one of them does.
 */
export function toAssetListItem(asset: {
  id: string;
  assetId: string;
  description: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string;
  assetType: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string; department: string } | null;
  devicePassword: { setAt: string; setBy: string | null } | null;
  devicePin: { setAt: string; setBy: string | null } | null;
  createdAt: string;
}): AssetListItem {
  return {
    id: asset.id,
    assetId: asset.assetId,
    description: asset.description,
    brand: asset.brand,
    model: asset.model,
    serialNumber: asset.serialNumber,
    status: asset.status,
    assetType: asset.assetType,
    assignedTo: asset.assignedTo,
    hasDevicePassword: asset.devicePassword !== null,
    hasDevicePin: asset.devicePin !== null,
    createdAt: asset.createdAt,
  };
}

export function StatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const presentation = statusPresentation(status);

  return (
    <Badge tone={presentation.tone} icon={presentation.icon} size={size} title={presentation.hint}>
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
        icon={<Inbox className="size-5" />}
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