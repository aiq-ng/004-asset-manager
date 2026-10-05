import { AssetCreateButton, type AssetTypeOption } from "@/features/assets/asset-create-form";

/**
 * Server wrapper for the register-asset sheet's trigger.
 *
 * It lives in its own file because `asset-create-form` is a `"use client"`
 * module — a Server Component cannot be declared there. Awaiting the type list
 * here keeps that query off the client bundle: only the rows the picker needs
 * cross the boundary, and the sheet's own open state stays in the client leaf.
 */
export async function RegisterAssetTrigger({
  assetTypes,
  openInitially = false,
}: {
  assetTypes: Promise<AssetTypeOption[]>;
  /** Open the sheet on arrival, for `/assets?new`. See `create-sheet-param`. */
  openInitially?: boolean;
}) {
  return <AssetCreateButton assetTypes={await assetTypes} openInitially={openInitially} />;
}

/**
 * Placeholder for the trigger while its type list resolves.
 *
 * Reserves the button's exact footprint so the header does not reflow when the
 * real button swaps in, and renders it disabled because the sheet cannot open
 * without its type list.
 */
export function RegisterAssetButtonFallback() {
  return (
    <button
      type="button"
      disabled
      className="inline-flex h-9 cursor-wait items-center gap-c54-2 rounded-c54-button bg-c54-action-primary px-c54-4 text-c54-sm font-c54-medium text-c54-action-primary-fg opacity-60"
    >
      Register asset
    </button>
  );
}