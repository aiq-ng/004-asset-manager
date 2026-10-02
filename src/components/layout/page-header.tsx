import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * Page header: a breadcrumb, a title block, and actions.
 *
 * Actions render as a row that wraps under the title on narrow screens, because a
 * desktop-sized button row is the first thing that breaks a phone layout.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-c54-section flex flex-col gap-c54-3", className)}>
      {breadcrumb}

      <div className="flex flex-col gap-c54-3 sm:flex-row sm:items-start sm:justify-between sm:gap-c54-6">
        <div className="min-w-0">
          {eyebrow ? <div className="mb-c54-2">{eyebrow}</div> : null}
          {/* `text-c54-3xl` is the smallest step on the scale that still reads as
              a page title rather than a card heading. Inter's optical sizing and
              the heading token's tight tracking do the rest. */}
          <h1 className="text-c54-3xl text-c54-text-primary">{title}</h1>
          {description ? (
            <p className="mt-c54-2 max-w-2xl text-c54-sm leading-c54-relaxed text-c54-text-secondary">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-c54-2 sm:pt-c54-1">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Breadcrumb trail. The final crumb is the current page and is not a link. */
export function Breadcrumb({ children }: { children: React.ReactNode }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-c54-2 text-c54-2xs text-c54-text-muted">
        {children}
      </ol>
    </nav>
  );
}

export function BreadcrumbLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="transition-colors hover:text-c54-text-primary">
        {children}
      </Link>
    </li>
  );
}

export function BreadcrumbSeparator() {
  return (
    <li aria-hidden="true" className="text-c54-text-muted/60">
      /
    </li>
  );
}

export function BreadcrumbCurrent({ children }: { children: React.ReactNode }) {
  return (
    <li aria-current="page" className="font-c54-medium text-c54-text-secondary">
      {children}
    </li>
  );
}