import {
  BulkAssetEntryButton,
  type AssetTypeOption,
} from "@/features/assets/bulk-asset-entry";

/**
 * Server wrapper for the bulk-register sheet's trigger.
 *
 * Same split as `RegisterAssetTrigger`: `bulk-asset-entry` is a `"use client"`
 * module, so the wrapper lives in its own file to keep the type query on the
 * server. Both triggers on the register share one `assetTypes` promise, so
 * opening either sheet costs no extra round trip.
 */
export async function BulkAssetEntryTrigger({
  assetTypes,
}: {
  assetTypes: Promise<AssetTypeOption[]>;
}) {
  return <BulkAssetEntryButton assetTypes={await assetTypes} />;
}

/**
 * Placeholder for the trigger while the type list resolves.
 *
 * Shaped like the real button — including the outline variant and the `sm` height
 * — so the header does not reflow or change colour when the button swaps in.
 */
export function BulkAssetEntryButtonFallback() {
  return (
    <button
      type="button"
      disabled
      className="inline-flex h-7 cursor-wait items-center gap-c54-2 rounded-c54-button border border-c54-border-default px-c54-3 text-c54-xs font-c54-medium text-c54-text-secondary opacity-60"
    >
      Register in bulk
    </button>
  );
}