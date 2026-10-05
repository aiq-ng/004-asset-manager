"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Upper bound on the wait, so one broken image can never block printing. */
const READY_TIMEOUT_MS = 10_000;

/**
 * Resolves once every image inside a tag has loaded and decoded and the web
 * fonts are ready. The QR is fetched from `/api/assets/[id]/qr`, so a fixed
 * delay is a guess: on a slow response the dialog opens first and the tag prints
 * with an empty QR box. A broken image still resolves, so the wait never hangs.
 */
async function waitForTagAssets(): Promise<void> {
  const images = Array.from(
    document.querySelectorAll<HTMLImageElement>(".c54-asset-tag img"),
  );

  const settled = images.map((img) =>
    img.complete
      ? img.decode().catch(() => undefined)
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
  );

  await Promise.race([
    Promise.all([...settled, document.fonts.ready]),
    new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
  ]);

  // Two frames, so the layout produced by those images has been painted.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

async function printWhenReady() {
  await waitForTagAssets();
  window.print();
}

/**
 * The print button and the settings the operator needs to get a clean sheet.
 *
 * Printing no longer starts by itself when the page opens. It used to: a
 * `useEffect` fired `window.print()` on mount, which made the dialog appear over
 * the label the moment the route rendered. That was hostile in both directions —
 * arriving at a run of a hundred labels to be immediately thrown into a print
 * dialog, and a reload (or a back navigation) re-firing it without being asked.
 * Printing is now something the operator asks for, which is what a destructive
 * system dialog should be.
 *
 * The wait before printing is unchanged and still the point of the client
 * island: `window.print()` from the server-rendered page can beat the browser's
 * layout and fonts, which on some browsers produces a blank sheet. The QR is
 * fetched from `/api/assets/[id]/qr`, so a fixed delay would be a guess — on a
 * slow response the dialog opens first and the tag prints with an empty QR box.
 */
/**
 * The print settings and the actions that use them.
 *
 * `children` is the slot for the other way of getting the same label off the
 * screen — the JPEG export, which rasterises the identical tag rather than
 * sending it to a printer. Both belong in one row beside the settings note: they
 * are two routes to the same artefact, and stacked vertically they read as two
 * separate tasks with an instruction paragraph wedged between them.
 *
 * The caller passes the whole export control, including its own progress text,
 * so the two buttons and any "Rendering 3 of 8…" status sit together rather
 * than the status stranding itself on a line of its own. The spacing belongs to
 * this component, so anything rendered as a child should not bring its own
 * bottom margin — see `ExportJpegButton`.
 */
export function PrintControls({
  label = "Print label",
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="c54-no-print mb-c54-section flex flex-wrap items-center justify-between gap-c54-4">
      <p className="text-c54-sm text-c54-text-secondary">
        In the print dialog set scale to 100%, margins to None, turn on
        background graphics and turn off headers and footers. Leave the paper
        size alone: the label sets its own.
      </p>
      <div className="flex flex-wrap items-center gap-c54-2">
        <Button size="sm" onClick={() => void printWhenReady()}>
          <Printer className="size-3.5" />
          {label}
        </Button>
        {children}
      </div>
    </div>
  );
}