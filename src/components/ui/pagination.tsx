import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * URL-driven pagination.
 *
 * Rendered entirely from links — no client JS, no state — so the page works
 * before hydration and every page is a real, crawlable URL. `buildHref` is
 * supplied by the caller so the surrounding filters and sort state survive a
 * page change.
 */
export function Pagination({
  page,
  pageSize,
  total,
  buildHref,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  buildHref: (page: number) => string;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-c54-3 border-t border-c54-border-default px-c54-pad-lg py-c54-pad",
        className,
      )}
    >
      <p className="text-c54-xs text-c54-text-secondary">
        Showing <span className="font-c54-mono text-c54-text-primary">{first}</span>–
        <span className="font-c54-mono text-c54-text-primary">{last}</span> of{" "}
        <span className="font-c54-mono text-c54-text-primary">{total.toLocaleString("en-GB")}</span>
      </p>

      <div className="flex items-center gap-c54-1">
        <PageLink href={buildHref(page - 1)} disabled={page <= 1} rel="prev">
          Previous
        </PageLink>

        <WindowedPages page={page} pageCount={pageCount} buildHref={buildHref} />

        <PageLink href={buildHref(page + 1)} disabled={page >= pageCount} rel="next">
          Next
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled?: boolean;
  rel?: "prev" | "next";
  children: React.ReactNode;
}) {
  const className = cn(
    "inline-flex h-7 items-center gap-c54-1 rounded-c54-button border border-c54-border-default px-c54-3 text-c54-xs font-c54-medium transition-colors",
    disabled
      ? "pointer-events-none text-c54-text-muted opacity-45"
      : "text-c54-text-primary hover:bg-c54-action-ghost-hover hover:border-c54-border-strong",
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link href={href} rel={rel} className={className}>
      {children}
    </Link>
  );
}

/**
 * Compact page window with ellipses. Showing every page would wrap the nav to
 * multiple lines once a list passes a few hundred results.
 */
function WindowedPages({
  page,
  pageCount,
  buildHref,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
}) {
  const pages: (number | "gap")[] = [];
  const push = (value: number | "gap") => {
    if (pages[pages.length - 1] !== value) pages.push(value);
  };

  push(1);
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) push("gap");
  for (let i = start; i <= end; i += 1) push(i);
  if (end < pageCount - 1) push("gap");
  if (pageCount > 1) push(pageCount);

  return (
    <>
      {pages.map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-c54-1 text-c54-xs text-c54-text-muted">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={buildHref(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cn(
              "inline-flex h-7 min-w-7 items-center justify-center rounded-c54-button border px-c54-2 font-c54-mono text-c54-xs transition-colors",
              entry === page
                ? "border-c54-action-primary bg-c54-action-primary text-c54-action-primary-fg"
                : "border-c54-border-default text-c54-text-secondary hover:bg-c54-action-ghost-hover",
            )}
          >
            {entry}
          </Link>
        ),
      )}
    </>
  );
}