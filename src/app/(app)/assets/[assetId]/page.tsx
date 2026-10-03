import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeChip } from "@/components/ui/badge";
import { Icons } from "@/components/ui/icons";
import { DescriptionList, DetailRow } from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbCurrent,
  BreadcrumbLink,
  BreadcrumbSeparator,
  PageHeader,
} from "@/components/layout/page-header";
import { StatusBadge } from "@/features/assets/asset-table";
import { AssetEditForm } from "@/features/assets/asset-edit-form";
import { AssetImageManager } from "@/features/assets/asset-image-manager";
import { AssetRetireControl } from "@/features/assets/asset-retire-control";
import { AssignmentHistory, AssignmentPanel } from "@/features/assets/assignment-panel";
import { getAsset } from "@/lib/services/assets";
import { listStaff } from "@/lib/services/staff";
import { isAssignableTarget } from "@/features/staff/role-presentation";
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Asset detail.
 *
 * Resolves the identifier the same way the service and the QR endpoint do, so a
 * scanned `IT-LAP-0001` and a clicked cuid land on the same page.
 */
export default async function AssetDetailPage({ params }: PageProps<"/assets/[assetId]">) {
  const actor = await requirePageActor();
  const { assetId } = await params;

  let asset;
  try {
    asset = await getAsset(assetId);
  } catch {
    notFound();
  }

  const canManage = can(actor.role, "asset:manage");
  const canAssign = can(actor.role, "assignment:create");

  // Candidates for the assign dialog, narrowed here by the same rules the
  // service enforces on write — an assigner is never offered themselves or an
  // admin. The panel stays a synchronous client component; hooks are illegal
  // in an async one.
  const staff = canAssign
    ? listStaff({ page: 1, pageSize: 100 }).then((result) =>
        result.items
          .filter((person) => isAssignableTarget(actor, person))
          .map((person) => ({
            id: person.id,
            name: person.name,
            department: person.department,
            email: person.email,
            role: person.role,
          })),
      )
    : undefined;

  return (
    <>
      <PageHeader
        title={asset.description}
        eyebrow={<CodeChip>{asset.assetId}</CodeChip>}
        breadcrumb={
          <Breadcrumb>
            <BreadcrumbLink href="/assets">Assets</BreadcrumbLink>
            <BreadcrumbSeparator />
            <BreadcrumbCurrent>{asset.assetId}</BreadcrumbCurrent>
          </Breadcrumb>
        }
        actions={
          <>
            <Link href={`/assets/${asset.assetId}/label`}>
              <Button variant="outline" size="sm">
                <Icons.Printer className="size-3.5" />
                Print label
              </Button>
            </Link>
            <a href={`/api/assets/${asset.assetId}/qr`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <Icons.Qr className="size-3.5" />
                QR code
              </Button>
            </a>
          </>
        }
      />

      <div className="grid gap-c54-section lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-c54-section">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-c54-6 sm:flex-row">
                {asset.imageUrl ? (
                  // A presigned storage URL is already a direct, single-use link,
                  // so `next/image` would only add a second hop and a loader that
                  // cannot see the signature.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.imageUrl}
                    alt={asset.description}
                    className="h-36 w-36 shrink-0 rounded-c54-card border border-c54-border-default object-cover"
                  />
                ) : null}

                <DescriptionList className="flex-1">
                  <DetailRow term="Status">
                    <StatusBadge status={asset.status} />
                  </DetailRow>
                  <DetailRow term="Type">
                    {asset.assetType.name}{" "}
                    <span className="text-c54-text-muted">({asset.assetType.code})</span>
                  </DetailRow>
                  <DetailRow term="Brand">
                    {asset.brand ?? <span className="text-c54-text-muted">—</span>}
                  </DetailRow>
                  <DetailRow term="Serial number">
                    {asset.serialNumber ?? <span className="text-c54-text-muted">—</span>}
                  </DetailRow>
                  <DetailRow term="Units">{asset.unit}</DetailRow>
                  <DetailRow term="Registered">
                    {new Date(asset.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </DetailRow>
                  <DetailRow term="Last updated">
                    {new Date(asset.updatedAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </DetailRow>
                </DescriptionList>
              </div>
            </CardContent>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>Edit</CardTitle>
              </CardHeader>
              <CardContent>
                <AssetEditForm
                  asset={asset}
                  canChangeStatus={canManage}
                />
              </CardContent>
            </Card>
          ) : null}

          {canManage && asset.status !== "RETIRED" ? (
            <AssetRetireControl
              assetId={asset.assetId}
              status={asset.status}
              assigned={asset.assignedTo !== null}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Assignment history</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentHistory history={asset.history} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-c54-section">
          <AssignmentPanel
            assignment={asset.assignment}
            canReturn={can(actor.role, "assignment:return")}
            canAssign={canAssign}
            assetId={asset.assetId}
            assetStatus={asset.status}
            staff={await staff}
          />

          <AssetImageManager
            assetId={asset.assetId}
            description={asset.description}
            imageUrl={asset.imageUrl}
            canManage={canManage}
          />

          <Card>
            <CardHeader>
              <CardTitle>Identifiers</CardTitle>
            </CardHeader>
            <CardContent>
              <DescriptionList>
                <DetailRow term="Asset id">
                  <CodeChip>{asset.assetId}</CodeChip>
                </DetailRow>
                <DetailRow term="Database id">
                  <code className="font-c54-mono text-c54-2xs break-all text-c54-text-muted">
                    {asset.id}
                  </code>
                </DetailRow>
              </DescriptionList>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}