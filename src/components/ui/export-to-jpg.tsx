"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toJpeg } from "html-to-image";
import JSZip from "jszip";

import { Button } from "@/components/ui/button";
import { AssetTag } from "@/features/assets/asset-tag";

/**
 * Exports each label as a print-ready JPEG, one file per asset, in a single ZIP
 * the operator can drop on a flash drive for the print shop.
 *
 * Geometry (the vendor works in inches):
 *   finished label  4 x 2.25in   (exactly 16:9, the tag's own shape)
 *   bleed           0.125in on every side
 *   file            4.25 x 2.5in at OUTPUT_DPI
 *
 * Each tag is laid out at a fixed 300 CSS px per inch in an off-screen slot and
 * rasterised at `OUTPUT_DPI / LAYOUT_DPI` times that, so the output size does not
 * depend on the window the operator happens to have open. The tag is the real
 * `AssetTag` — the same markup the printed page uses — so the JPEG cannot drift
 * from it.
 */

const LAYOUT_DPI = 300;
const OUTPUT_DPI = 600;

const TRIM_WIDTH_IN = 4;
const BLEED_IN = 0.125;

const BLEED_PX = BLEED_IN * LAYOUT_DPI; // 37.5
const TAG_WIDTH_PX = TRIM_WIDTH_IN * LAYOUT_DPI; // 1200
const FILE_WIDTH_PX = (TRIM_WIDTH_IN + 2 * BLEED_IN) * LAYOUT_DPI; // 1275
const FILE_HEIGHT_PX = ((TRIM_WIDTH_IN * 9) / 16 + 2 * BLEED_IN) * LAYOUT_DPI; // 750

export type ExportableTag = {
  assetId: string;
  device: string;
  position: number;
  /**
   * Null rather than absent when the register has no serial on the row, which is
   * the shape `AssetLabelDto` hands over. Normalised to "" at the render, where
   * the tag's own prop already treats "no serial" as an empty line.
   */
  serialNumber?: string | null;
};

/** Resolves once the slot's images are decoded and the web fonts are ready. */
async function waitForRender(node: HTMLElement): Promise<void> {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all([
    ...images.map((img) =>
      img.complete
        ? img.decode().catch(() => undefined)
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
    document.fonts.ready,
  ]);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Writes the resolution into the JPEG's JFIF header. A canvas JPEG carries no
 * real resolution, so a design program would open the 2550px-wide file as 35
 * inches wide. With this it opens at 4.25in. Left untouched if the header is not
 * the JFIF layout we expect.
 */
function setJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const isJfif =
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[3] === 0xe0 &&
    bytes[6] === 0x4a && // J
    bytes[7] === 0x46 && // F
    bytes[8] === 0x49 && // I
    bytes[9] === 0x46; // F
  if (!isJfif) return bytes;

  bytes[13] = 1; // units: dots per inch
  bytes[14] = dpi >> 8;
  bytes[15] = dpi & 0xff;
  bytes[16] = dpi >> 8;
  bytes[17] = dpi & 0xff;
  return bytes;
}

export function ExportJpegButton({
  assets,
  logoLabel,
}: {
  assets: ExportableTag[];
  logoLabel?: string;
}) {
  const [current, setCurrent] = useState<ExportableTag | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  async function exportAll() {
    try {
      const zip = new JSZip();

      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        setStatus(`Rendering ${i + 1} of ${assets.length}…`);
        flushSync(() => setCurrent(asset));

        const node = slotRef.current?.firstElementChild as HTMLElement | null;
        if (!node) throw new Error("Export slot did not render");
        await waitForRender(node);

        const dataUrl = await toJpeg(node, {
          width: FILE_WIDTH_PX,
          height: FILE_HEIGHT_PX,
          pixelRatio: OUTPUT_DPI / LAYOUT_DPI,
          quality: 0.98,
          backgroundColor: "#ffffff",
        });
        zip.file(`${asset.assetId}.jpg`, setJpegDpi(dataUrlToBytes(dataUrl), OUTPUT_DPI));
      }

      zip.file(
        "README.txt",
        [
          "C54 asset labels",
          "",
          "Finished size: 4 x 2.25 in",
          "Bleed: 0.125 in on every side (each file is 4.25 x 2.5 in)",
          `Resolution: ${OUTPUT_DPI} dpi, RGB JPEG`,
          "One file per label, named by asset number.",
        ].join("\n"),
      );

      setStatus("Building ZIP…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `c54-labels-${assets.length}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      console.error(error);
      setStatus("Export failed — see the console.");
      return;
    } finally {
      setCurrent(null);
    }
    setStatus(null);
  }

  return (
    <>
      {/* Rendered as a child of `PrintControls`, which owns the row and the
          spacing around it. That is why this wrapper carries no bottom margin of
          its own — with one it would drop the button a line below the print
          button it is supposed to sit beside. */}
      <div className="c54-no-print flex items-center gap-c54-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void exportAll()}
          disabled={current !== null}
        >
          Export JPEGs ({assets.length})
        </Button>
        {status ? <span className="text-c54-sm text-c54-text-secondary">{status}</span> : null}
      </div>

      {/* Off-screen slot, one tag at a time. Fixed pixel geometry: the tag sits
          in a trim-sized box inside a file-sized box, and its header and footer
          bleed into the padding. Never printed, never visible. */}
      <div
        ref={slotRef}
        aria-hidden
        className="c54-no-print"
        style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}
      >
        {current ? (
          <div
            key={current.assetId}
            style={{
              width: FILE_WIDTH_PX,
              height: FILE_HEIGHT_PX,
              padding: `${BLEED_PX}px ${BLEED_PX}px 0`,
              boxSizing: "border-box",
              background: "#fff",
              overflow: "hidden",
            }}
          >
            <div style={{ width: TAG_WIDTH_PX }}>
              <AssetTag
                assetNumber={current.assetId}
                device={current.device}
                position={current.position}
                serialNumber={current.serialNumber ?? ""}
                logoLabel={logoLabel}
                bleed={`${BLEED_PX}px`}
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}