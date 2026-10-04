import type { CSSProperties } from "react";

/**
 * Printed asset tag.
 *
 * A Server Component on purpose: everything it needs is already-resolved data,
 * and the QR comes from the app's own endpoint (`/api/assets/[id]/qr`), the
 * same source every other QR in the app uses. One implementation of what gets
 * encoded means a printed tag and the detail-page QR can never drift.
 *
 * All colours come from the printed-brand palette in `globals.css` (`c54-blue`,
 * `c54-red`, `c54-navy`, `c54-gray`, `c54-line`); white is the label stock
 * itself, so it stays a literal. Sizing is container-relative (`cqw`), which is
 * what lets the same markup scale from the on-screen preview to the printed
 * label without media queries.
 */

type AssetTagProps = {
  /** Human asset id, e.g. `IT-LAP-0001` — also what the QR points at. */
  assetNumber: string;
  device: string;
  /**
   * Position of this asset among those of the same type, e.g. `10` when it is
   * the tenth monitor. Printed in the `UNIT` row — see `formatUnit`.
   */
  position: number;
  serialNumber?: string;
  /** Text of the red band under the logo mark. */
  logoLabel?: string;
  /**
   * Print bleed as any CSS length, e.g. `"3mm"`. The blue header and red footer
   * extend this far past the trim edge so a die-cut that drifts by a millimetre
   * never leaves a white sliver. Normally left unset: `globals.css` sets
   * `--bleed` to 0mm on screen and to the print bleed inside `@media print`, so
   * the number lives next to the `@page` size it has to agree with. An explicit
   * value here overrides the stylesheet (inline style wins).
   */
  bleed?: string;
};

/**
 * Renders the `UNIT` row as a position within its type: `01`, `02`, ... `250`.
 *
 * **No denominator.** It used to print `01 of 20`, and that was a trap: the total
 * is a live count of the register, so a label printed today reads `01 of 20` and
 * is permanently wrong the moment the twenty-first laptop is registered. Nothing
 * can be done about it afterwards — the label is on a device, and the drift is
 * silent, because `01 of 25` still looks like a perfectly plausible label. An
 * earlier run of labels would disagree with a later one about the same fleet.
 *
 * The position alone is safe to print, and not by luck: `reserveAssetId` is a
 * monotonic per-type counter whose numbers are never reused, and retiring an
 * asset is a soft delete, so no row ever leaves the type it was counted in. A
 * given laptop's `UNIT` therefore cannot change after the label is stuck to it.
 *
 * Zero-padded to two digits so a column of tags keeps one width. Fixed padding,
 * not padded to the width of some total — that is the same dependency on a
 * moving number that this row just gave up.
 */
export function formatUnit(position: number): string {
  return String(position).padStart(2, "0");
}

function C54Logo() {
  return (
    <div className="relative aspect-[396/418] w-[31cqw] shrink-0 overflow-hidden rounded-[0.8cqw] bg-c54-blue">
      {/* A static brand asset from /public: `next/image` would only add a
          loader and an optimization hop to a file that never changes. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/c54-mark.png"
        alt="C54"
        className="absolute inset-x-0 top-0 h-[68%] w-full object-cover object-top"
      />
      {/* Dynamic band: starts ~68% down in the reference */}
      <div className="absolute inset-x-0 bottom-0 flex h-[32%] items-center justify-center bg-c54-red">
        <span className="text-[7.4cqw] font-black uppercase leading-none tracking-[-0.02em] text-white">
          News
        </span>
      </div>
    </div>
  );
}

export function AssetTag({
  assetNumber,
  device,
  position,
  serialNumber = "",
  logoLabel = "HABARI",
  bleed,
}: AssetTagProps) {
  return (
    <div
      className="c54-asset-tag @container w-full max-w-[1280px]"
      style={bleed ? ({ "--bleed": bleed } as CSSProperties) : undefined}
    >
      {/* No `overflow-hidden` here on purpose: the header and footer grow past
          this box by `--bleed`, and clipping it would cut the bleed off. The
          logo clips itself, so nothing else relied on it. */}
      <div className="relative flex aspect-video w-full flex-col bg-white text-c54-navy">
        {/* Header. The negative margins cancel the extra height and width the
            bleed adds, so the body does not move; the matching padding keeps
            the text where it was relative to the trim edge. */}
        <header className="-mx-[var(--bleed)] -mt-[var(--bleed)] flex h-[calc(15.9%_+_var(--bleed))] items-center justify-between bg-c54-blue px-[calc(4.4cqw_+_var(--bleed))] pt-[var(--bleed)]">
          <h1 className="text-[3.8cqw] font-extrabold tracking-[-0.02em] text-white">
            C54 STREAMING DOME
          </h1>
          <span className="text-[2.6cqw] font-semibold text-white/75">IT ASSET TAG</span>
        </header>

        {/* Body */}
        <main className="flex flex-1 items-center gap-[3.2cqw] px-[4.4cqw]">
          <C54Logo/>
          <section className="flex-1">
            <p className="text-[2.2cqw] font-semibold tracking-wide text-c54-gray">ASSET NO.</p>
            <p className="whitespace-nowrap text-[4.4cqw] font-extrabold leading-tight tracking-[-0.02em]">
              {assetNumber}
            </p>

            <div className="my-[2.6cqw] h-[0.25cqw] w-full bg-c54-line" />

            {/* The label column is sized to the widest label, "DEVICE", rather
                than being a rough proportion of the row. At `8.5cqw` it landed
                at 95px against a word that needed 95px *plus* the tracking, so
                "DEVICE" broke across two lines on every single tag — which is
                how a label ends up reading "DEVIC E" with the value dropped
                underneath it. The labels are `nowrap` so this cannot regress
                silently at a new cell size either. */}
            <dl className="grid grid-cols-[10.5cqw_1fr] items-end gap-y-[1.6cqw] text-[2.4cqw]">
              <dt className="whitespace-nowrap font-semibold tracking-wide text-c54-gray">DEVICE</dt>
              <dd className="min-w-0 font-bold">{device}</dd>

              <dt className="whitespace-nowrap font-semibold tracking-wide text-c54-gray">UNIT</dt>
              <dd className="min-w-0 font-bold">{formatUnit(position)}</dd>

              <dt className="whitespace-nowrap font-semibold tracking-wide text-c54-gray">S/N</dt>
              {/* `min-h` rather than `h`: a long serial then grows the box and
                  carries its underline down with it, instead of wrapping over a
                  rule that stayed put. */}
              <dd className="min-h-[3.2cqw] min-w-0 border-b-[0.25cqw] border-c54-navy font-semibold">
                {serialNumber}
              </dd>
            </dl>
          </section>

          <section className="flex w-[17.8cqw] shrink-0 flex-col items-center gap-[1cqw]">
            {/* The endpoint encodes `{APP_URL}/assets/{assetNumber}` — the same
                URL the on-screen QR codes use, so scanners land on the same page
                whichever code they scan. That route is public: a scan opens a
                read-only card for anyone holding the device, without a session. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/assets/${assetNumber}/qr?format=svg`}
              alt={`QR code linking to ${assetNumber}`}
              className="h-auto w-full"
            />
            <p className="text-[1.6cqw] font-semibold tracking-wide text-c54-gray">
              SCAN TO VERIFY
            </p>
          </section>
        </main>

        {/* Footer: same bleed treatment as the header, growing downward. */}
        <footer className="-mx-[var(--bleed)] -mb-[var(--bleed)] flex h-[calc(13.2%_+_var(--bleed))] items-center justify-center bg-c54-red pb-[var(--bleed)] text-[2.6cqw] font-bold text-white">
          PROPERTY OF C54NEWS CHANNEL LIMITED&nbsp;&nbsp;·&nbsp;&nbsp;DO NOT REMOVE
        </footer>
      </div>
    </div>
  );
}