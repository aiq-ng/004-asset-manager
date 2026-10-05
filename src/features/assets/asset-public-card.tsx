import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { CodeChip } from "@/components/ui/badge";
import { StatusBadge } from "@/features/assets/asset-table";
import type { PublicAssetDto } from "@/lib/services/assets";

/**
 * What an unauthenticated visitor sees after scanning a tag.
 *
 * Server Component, no interactivity, chrome-free: a scanned tag is a lookup,
 * not an invitation into the app. Only fields from `PublicAssetDto` are shown.
 */

const registeredFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-c54-text-muted">{children}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-c54-card border border-c54-border-default bg-slate-50/70 p-4">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-c54-text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-base font-medium">{children}</dd>
    </div>
  );
}

function VerifiedIcon() {
  return <ShieldCheck aria-hidden="true" className="size-3.5" strokeWidth={2.5} />;
}

export function AssetPublicCard({ asset }: { asset: PublicAssetDto }) {
  const makeAndModel = [asset.brand, asset.model].filter(Boolean).join(" ");
  const holder = asset.assignedTo;
  const initials = holder
    ? holder.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
    : null;

  return (
    // Soft top glow + faint dot grid give the page depth without adding chrome.
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-c54-section">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(99,102,241,0.14),transparent),radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.07)_1px,transparent_0)] [background-size:auto,22px_22px]"
      />

      <article className="w-full max-w-3xl overflow-hidden rounded-c54-card border border-c54-border-default bg-white shadow-[0_24px_60px_-20px_rgba(15,23,42,0.25)]">
        {/* Accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500" />

        {/* Brand header */}
        <header className="flex items-center justify-between gap-4 border-b border-c54-border-default px-5 py-4 md:px-8">
          <Image
            src="/images/logo.png"
            alt="Company logo"
            width={160}
            height={48}
            priority
            className="h-8 w-auto md:h-10"
          />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <VerifiedIcon />
            Registered asset
          </span>
        </header>

        <div className="flex flex-col gap-c54-6 px-5 py-6 md:px-8 md:py-8">
          {/* Hero: photo + identity */}
          <div className="flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:text-left">
            {asset.imageUrl ? (
              // Presigned storage URL: `next/image` can't read the signature.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.imageUrl}
                alt={asset.description}
                className="aspect-square w-full max-w-56 shrink-0 rounded-c54-card border border-c54-border-default object-cover shadow-md md:w-48"
              />
            ) : null}

            <div className="flex min-w-0 flex-col items-center gap-3 md:items-start">
              <div className="flex flex-wrap items-center justify-center gap-c54-2 md:justify-start">
                <CodeChip>{asset.assetId}</CodeChip>
                <StatusBadge status={asset.status} />
              </div>
              <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                {asset.description}
              </h1>
              {makeAndModel ? (
                <p className="text-base text-c54-text-muted md:text-lg">{makeAndModel}</p>
              ) : null}
            </div>
          </div>

          {/* Focal point: the answer to "is this the one I have?" */}
          <section
            aria-labelledby="assigned-to"
            className="flex items-center gap-4 rounded-c54-card border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 md:gap-5 md:p-6"
          >
            {initials ? (
              <div
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-md md:h-16 md:w-16 md:text-xl"
              >
                {initials}
              </div>
            ) : null}
            <div className="min-w-0">
              <h2
                id="assigned-to"
                className="text-[11px] font-semibold uppercase tracking-wider text-c54-text-muted"
              >
                Currently assigned to
              </h2>
              {holder ? (
                <p className="mt-1 text-xl font-semibold md:text-2xl">
                  {holder.name}
                  <span className="mt-0.5 block text-sm font-normal text-c54-text-muted md:text-base">
                    {holder.department}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-xl">
                  <Muted>Not currently assigned</Muted>
                </p>
              )}
            </div>
          </section>

          {/* Detail tiles */}
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type">
              {asset.assetType.name} <Muted>({asset.assetType.code})</Muted>
            </Field>
            <Field label="Serial number">
              {asset.serialNumber ? (
                <span className="break-all font-mono text-[15px]">{asset.serialNumber}</span>
              ) : (
                <Muted>—</Muted>
              )}
            </Field>
            <Field label="Make & model">{makeAndModel || <Muted>—</Muted>}</Field>
            <Field label="Registered">
              {registeredFormat.format(new Date(asset.createdAt))}
            </Field>
          </dl>
        </div>

        {/* Footer */}
        <footer className="border-t border-c54-border-default bg-slate-50 px-5 py-3.5 text-center text-xs text-c54-text-muted md:px-8">
          You reached this page by scanning an asset tag. Found this device? Please return it to
          the IT department.
        </footer>
      </article>
    </main>
  );
}