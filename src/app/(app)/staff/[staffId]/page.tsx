import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeChip } from "@/components/ui/badge";
import { Icons } from "@/components/ui/icons";
import { DescriptionList, DetailRow, Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbLink,
  BreadcrumbSeparator,
  PageHeader,
} from "@/components/layout/page-header";
import { StatusBadge } from "@/features/assets/asset-table";
import { StaffRoleBadge } from "@/features/staff/staff-role-badge";
import { StaffEditButton } from "@/features/staff/staff-forms";
import { StaffDeleteControl } from "@/features/staff/staff-delete-control";
import { rolePresentation } from "@/features/staff/role-presentation";
import { listDepartmentOptions } from "@/lib/services/departments";
import { getStaff } from "@/lib/services/staff";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";
import { formatDate, formatRelative } from "@/lib/utils/format";

/**
 * Staff detail: the person, what they are holding, and everything they have ever
 * held. History rows are never deleted, so this is the audit view for an asset
 * chain.
 */
export default async function StaffDetailPage({ params }: PageProps<"/staff/[staffId]">) {
  const actor = await requirePageActor();
  const { staffId } = await params;
  const now = new Date();

  let staff;
  try {
    staff = await getStaff(staffId);
  } catch {
    notFound();
  }

  const presentation = rolePresentation(staff.role);
  const canManage = can(actor.role, "staff:manage");

  // The same numbers the service checks before deleting: currently-held assets
  // and any history at all. Computed here so the control can disable itself
  // with a reason rather than surfacing the service's error blind.
  const holdingCount = staff.currentAssets.length;
  const historyCount = staff.history.length;

  return (
    <>
      <PageHeader
        title={staff.name}
        eyebrow={<StaffRoleBadge role={staff.role} />}
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbLink href="/staff">Staff</BreadcrumbLink>
            <BreadcrumbSeparator />
            <BreadcrumbCurrent>{staff.name}</BreadcrumbCurrent>
          </Breadcrumb>
        }
        actions={
          <>
            <a href={`mailto:${staff.email}`}>
              <Button variant="outline" size="sm">
                <Icons.Mail className="size-3.5" />
                Email
              </Button>
            </a>
            {canManage ? (
              <StaffEditButton staff={staff} departments={await listDepartmentOptions()} />
            ) : null}
          </>
        }
      />

      <div className="grid gap-c54-section lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-c54-section">
          <Card>
            <CardHeader>
              <CardTitle>
                Currently holding{" "}
                <span className="font-c54-mono text-c54-sm text-c54-text-muted">
                  {staff.currentAssets.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {staff.currentAssets.length === 0 ? (
                <p className="text-c54-sm text-c54-text-secondary">
                  Nothing assigned. Pick an available asset to hand over.
                </p>
              ) : (
                <Table>
                  <thead>
                    <TableRow>
                      <TableHeader className="w-40">Asset</TableHeader>
                      <TableHeader>Description</TableHeader>
                      <TableHeader className="w-32">Status</TableHeader>
                      <TableHeader className="w-28">Units</TableHeader>
                    </TableRow>
                  </thead>
                  <TableBody>
                    {staff.currentAssets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <Link href={`/assets/${asset.assetId}`} className="hover:underline">
                            <CodeChip>{asset.assetId}</CodeChip>
                          </Link>
                        </TableCell>
                        <TableCell className="text-c54-sm">{asset.description}</TableCell>
                        <TableCell>
                          <StatusBadge status={asset.status} />
                        </TableCell>
                        <TableCell className="text-c54-xs">{asset.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment history</CardTitle>
            </CardHeader>
            <CardContent>
              {staff.history.length === 0 ? (
                <p className="text-c54-sm text-c54-text-secondary">No assignments recorded yet.</p>
              ) : (
                <Table>
                  <thead>
                    <TableRow>
                      <TableHeader className="w-40">Asset</TableHeader>
                      <TableHeader>Description</TableHeader>
                      <TableHeader className="w-36">Assigned</TableHeader>
                      <TableHeader className="w-36">Returned</TableHeader>
                      <TableHeader>Note</TableHeader>
                    </TableRow>
                  </thead>
                  <TableBody>
                    {staff.history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Link href={`/assets/${entry.assetId}`} className="hover:underline">
                            <CodeChip>{entry.assetId}</CodeChip>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="block text-c54-sm">{entry.asset.description}</span>
                          <span className="text-c54-2xs text-c54-text-muted">
                            {entry.asset.assetType.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-c54-xs text-c54-text-secondary">
                          {formatDate(entry.dateAssigned)}
                        </TableCell>
                        <TableCell className="text-c54-xs text-c54-text-secondary">
                          {entry.dateReturned ? (
                            formatDate(entry.dateReturned)
                          ) : (
                            <span className="font-c54-medium text-c54-text-primary">Out now</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-56">
                          {entry.note ? (
                            <span
                              className="block truncate text-c54-xs text-c54-text-secondary"
                              title={entry.note}
                            >
                              {entry.note}
                            </span>
                          ) : (
                            <span className="text-c54-text-muted">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-c54-section">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <DetailRow term="Department">{staff.department}</DetailRow>
                <DetailRow term="Email">
                  <a href={`mailto:${staff.email}`} className="hover:underline">
                    {staff.email}
                  </a>
                </DetailRow>
                <DetailRow term="Phone">
                  {staff.phone ?? <span className="text-c54-text-muted">—</span>}
                </DetailRow>
                <DetailRow term="Role">{presentation.label}</DetailRow>
                <DetailRow term="Can sign in">
                  {staff.role === "SUPERADMIN" ? "Yes" : "Unless no password was set"}
                </DetailRow>
              </DescriptionList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-c54-sm text-c54-text-secondary">{presentation.summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <DetailRow term="Created">
                  {formatDate(staff.createdAt)}{" "}
                  <span className="text-c54-2xs text-c54-text-muted">
                    ({formatRelative(staff.createdAt, now)})
                  </span>
                </DetailRow>
                <DetailRow term="Updated">{formatDate(staff.updatedAt)}</DetailRow>
                <DetailRow term="Database id">
                  <code className="font-c54-mono text-c54-2xs break-all text-c54-text-muted">
                    {staff.id}
                  </code>
                </DetailRow>
              </DescriptionList>
            </CardContent>
          </Card>

          {canManage ? (
            <StaffDeleteControl
              staff={{
                id: staff.id,
                name: staff.name,
                email: staff.email,
                role: staff.role,
                holdingCount,
                historyCount,
              }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}