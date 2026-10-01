import QRCode from "qrcode";

import { getEnv } from "@/lib/env";

export type QrFormat = "png" | "svg";

export const QR_CONTENT_TYPE: Record<QrFormat, string> = {
  png: "image/png",
  svg: "image/svg+xml",
};

/** Deep link a scanner opens, e.g. https://inventory.local/assets/IT-LAP-0001 */
export function buildAssetUrl(assetId: string): string {
  return `${getEnv().APP_URL}/assets/${encodeURIComponent(assetId)}`;
}

export interface RenderedQr {
  body: Buffer | string;
  contentType: string;
  filename: string;
}

/**
 * Renders on demand — QR codes are never persisted in object storage.
 */
export async function renderQrCode(
  assetId: string,
  format: QrFormat,
): Promise<RenderedQr> {
  const url = buildAssetUrl(assetId);

  const body =
    format === "png"
      ? await QRCode.toBuffer(url, { type: "png", width: 512, margin: 2 })
      : await QRCode.toString(url, { type: "svg", margin: 2 });

  return {
    body,
    contentType: QR_CONTENT_TYPE[format],
    filename: `${assetId}.${format}`,
  };
}