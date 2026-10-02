import Link from "next/link";
import { notFound } from "next/navigation";

import { Icons } from "@/components/ui/icons";
import { PrintTrigger } from "@/components/layout/print-trigger";
import { AssetTag } from "@/features/assets/asset-tag";
import { listAssetsForLabels } from "@/lib/services/assets";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Printable asset tag.
 *
 * Deliberately chrome-free: everything around the tag carries `c54-no-print`,
 * so the printed sheet is just the branded label — logo band, asset number,
 * device details and the QR that resolves back to the detail page. The tag is
 * rendered directly rather than in a hidden print-only block, so the on-screen
 * layout and the printed sheet are the same element and can never diverge.
 */
export default async function AssetLabelPage({
  params,
}: PageProps<"/assets/[assetId]/label">) {
  await requirePageActor();
  const { assetId } = await params;

  // Read through the same service call the batch sheet uses, rather than the
  // full detail view. A label needs four fields and one extra grouped count for
  // the `01 of 20` denominator; the detail view pulls history and assignments it
  // would never print. Sharing the call also means a label cannot drift between
  // being printed alone and being printed in a batch.
  const [asset] = await listAssetsForLabels([assetId]);
  if (!asset) notFound();

  return (
    <>
      <div className="c54-no-print mb-c54-section">
        <Link
          href={`/assets/${asset.assetId}`}
          className="inline-flex items-center gap-c54-2 text-c54-sm text-c54-text-secondary transition-colors hover:text-c54-text-primary"
        >
          <Icons.ArrowLeft className="size-4" />
          Back to {asset.assetId}
        </Link>
      </div>

      <PrintTrigger />

      {/* The tag is the print target and the preview in one: on screen it lays
          out as a full-width card, on paper the chrome around it is hidden by
          the print stylesheet. `c54-label-single` restores a margin, because the
          print stylesheet sets the page margin to zero for the batch sheets. */}
      <div className="c54-label-single">
        <AssetTag
          logoLabel="Nigeria"
          assetNumber={asset.assetId}
          device={asset.device}
          position={asset.position}
          positionTotal={asset.positionTotal}
          serialNumber={asset.serialNumber ?? ""}
        />
      </div>

      <div className="c54-no-print mt-c54-section text-c54-2xs text-c54-text-muted">
        Tip: the QR encodes{" "}
        <code className="font-c54-mono">/assets/{asset.assetId}</code> —
        scanning it with a phone opens the detail page.
      </div>
    </>
  );
}
