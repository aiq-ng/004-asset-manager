import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeChip } from "@/components/ui/badge";
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
import { getAsset, signStorageUrl } from "@/lib/services/assets";
import { listStaffOptions } from "@/lib/services/staff";
import { isAssignableTarget } from "@/features/staff/role-presentation";
import { can, type Actor } from "@/lib/auth/permissions";
import { RegisteredLabelPrompt } from "@/features/assets/registered-label-prompt";

/**
 * The signed-in half of the asset detail page.
 *
 * Split out of the route component so `/assets/[assetId]` can serve both a
 * session and a bare QR scan: the route decides which of the two it is, and
 * hands this one the actor it already resolved rather than having it look one up
 * again. `getActor` is memoised per request, so the double lookup the guard used
 * to do was free — but threading the actor through makes the "this branch
 * requires a session" claim a property of the type signature rather than a
 * convention.
 *
 * Resolves the identifier the same way the service and the QR endpoint do, so a
 * scanned `IT-LAP-0001` and a clicked cuid land on the same page.
 */
export async function AssetDetailView({
  assetId,
  actor,
  justRegistered = false,
}: {
  assetId: string;
  actor: Actor;
  /**
   * Whether to raise the one-off "print a label for this?" offer.
   *
   * Set by the route from the `registered` query flag the create action
   * redirects with. Defaulted rather than required so every other caller — the
   * public route's signed-in branch, and anything added later — gets the plain
   * asset page and cannot accidentally inherit a dialog.
   */
  justRegistered?: boolean;
}) {
  let asset;
  try {
    asset = await getAsset(assetId);
  } catch {
    notFound();
  }

  const canManage = can(actor.role, "asset:manage");
  const canAssign = can(actor.role, "assignment:create");

  // Return photos are stored as keys on the assignment rows; the timeline needs
  // signed URLs to render them. Signed here rather than in the serializer so a
  // list read never pays for signatures on rows nobody is displaying.
  const history = await Promise.all(
    asset.history.map(async (entry) => ({
      ...entry,
      returnImageUrl: entry.returnImageKey ? await signStorageUrl(entry.returnImageKey) : null,
    })),
  );

  // The most recent closed assignment, for the panel's "not currently assigned"
  // card. Taken from the history rather than from `asset.assignment`, which is
  // null exactly when there is nothing out — the two facts a reader wants are
  // "who had it" and "who has it", and only one of them lives on that field.
  //
  // Flattened rather than passed through, because `find` does not narrow
  // `dateReturned` on the row it returns and the panel only ever wants the
  // three fields it displays.
  const closed = history.find((entry) => entry.dateReturned !== null);
  const lastReturn = closed?.dateReturned
    ? {
        dateReturned: closed.dateReturned,
        staff: { name: closed.staff.name, department: closed.staff.department },
        returnNote: closed.returnNote,
      }
    : null;

  // Candidates for the assign dialog, narrowed here by the same rules the
  // service enforces on write — an assigner is never offered themselves or an
  // admin. The panel stays a synchronous client component; hooks are illegal
  // in an async one.
  const staff = canAssign
    ? listStaffOptions().then((people) =>
        people.filter((person) => isAssignableTarget(actor, person)),
      )
    : undefined;

  return (
    <>
      {/* Raised after the asset is registered, once. See `RegisteredLabelPrompt`. */}
      {justRegistered ? (
        <RegisteredLabelPrompt assetId={asset.assetId} assetNumber={asset.assetId} />
      ) : null}

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
                <Printer className="size-3.5" />
                Print label
              </Button>
            </Link>
            <a href={`/api/assets/${asset.assetId}/qr`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <QrCode className="size-3.5" />
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
                  <DetailRow term="Model">
                    {asset.model ?? <span className="text-c54-text-muted">—</span>}
                  </DetailRow>
                  <DetailRow term="Serial number">
                    {asset.serialNumber ?? <span className="text-c54-text-muted">—</span>}
                  </DetailRow>
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
              <AssignmentHistory history={history} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-c54-section">
          <AssignmentPanel
            assignment={asset.assignment}
            lastReturn={lastReturn}
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