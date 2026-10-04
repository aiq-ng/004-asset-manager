import Link from "next/link";

import { Badge, CodeChip } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/feedback";
import { statusPresentation } from "@/features/assets/asset-status";
import { formatRelative } from "@/lib/utils/format";
import { buildHref } from "@/lib/utils/search-params";
import type { AssetTotals } from "@/features/dashboard/queries";

/**
 * Dashboard sections.
 *
 * Each is an independent `async` Server Component rendered inside its own
 * `<Suspense>` boundary by `page.tsx`. The shell and the summary row therefore
 * paint immediately, and a slow count never blocks a fast list.
 */
export async function TotalsSection({ totals }: { totals: Promise<AssetTotals> }) {
  const stats = await totals;

  const cards = [
    { label: "Total assets", value: stats.all, href: "/assets", tone: "neutral" as const },
    { label: "Available", value: stats.available, href: "/assets?status=AVAILABLE", tone: "success" as const },
    { label: "Assigned", value: stats.assigned, href: "/assets?status=ASSIGNED", tone: "accent" as const },
    {
      label: "Needs attention",
      value: stats.underRepair,
      href: "/assets?status=UNDER_REPAIR",
      tone: "warning" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-c54-gap lg:grid-cols-4">
      {cards.map((card) => (
        <Link key={card.label} href={card.href} className="group">
          <StatCard
            label={card.label}
            value={card.value.toLocaleString("en-GB")}
            hint="View list"
            tone={card.tone}
            className="h-full transition-colors group-hover:border-c54-border-strong"
          />
        </Link>
      ))}
    </div>
  );
}

export function TotalsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-c54-gap lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-c54-card border border-c54-border-default bg-c54-bg-card p-c54-pad-lg">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-c54-3 h-8 w-16" />
          <Skeleton className="mt-c54-2 h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export interface RecentAsset {
  id: string;
  assetId: string;
  description: string;
  status: string;
  assetType: { name: string; code: string };
  createdAt: string;
}

export async function RecentAssetsSection({ items }: { items: Promise<{ items: RecentAsset[] }> }) {
  const { items: assets } = await items;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Recently added</CardTitle>
          <p className="mt-c54-1 text-c54-xs text-c54-text-secondary">
            The newest entries on the register.
          </p>
        </div>
        <Link
          href="/assets"
          className="inline-flex items-center gap-c54-1 text-c54-xs font-c54-medium text-c54-text-accent hover:underline"
        >
          All assets
          <Icons.ChevronRight className="size-3" />
        </Link>
      </CardHeader>

      {assets.length === 0 ? (
        <EmptyState
          icon={<Icons.Inbox className="size-5" />}
          title="No assets yet"
          description="Once the first asset type exists, assets can be registered here."
        />
      ) : (
        <ul className="divide-y divide-c54-border-default">
          {assets.map((asset) => {
            const status = statusPresentation(asset.status);
            return (
              <li key={asset.id}>
                <Link
                  href={`/assets/${asset.assetId}`}
                  className="flex items-center gap-c54-3 px-c54-pad-lg py-c54-3 transition-colors hover:bg-c54-action-ghost-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-c54-sm text-c54-text-primary">{asset.description}</p>
                    <p className="mt-c54-1 flex flex-wrap items-center gap-c54-2">
                      <CodeChip>{asset.assetId}</CodeChip>
                      <span className="text-c54-2xs text-c54-text-muted">{asset.assetType.name}</span>
                    </p>
                  </div>
                  <Badge tone={status.tone} icon={status.icon} size="sm">
                    {status.label}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export interface RecentAssignment {
  id: string;
  dateAssigned: string;
  staff: { name: string; department: string };
  asset: { assetId: string; description: string; status: string };
}

export async function RecentAssignmentsSection({
  items,
}: {
  items: Promise<{ items: RecentAssignment[] }>;
}) {
  const { items: assignments } = await items;
  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Latest handovers</CardTitle>
          <p className="mt-c54-1 text-c54-xs text-c54-text-secondary">
            The most recent assignments across the organisation.
          </p>
        </div>
        <Link
          href="/assignments"
          className="inline-flex items-center gap-c54-1 text-c54-xs font-c54-medium text-c54-text-accent hover:underline"
        >
          All assignments
          <Icons.ChevronRight className="size-3" />
        </Link>
      </CardHeader>

      {assignments.length === 0 ? (
        <EmptyState
          icon={<Icons.Inbox className="size-5" />}
          title="Nothing handed over yet"
          description="Assignments will appear here as soon as assets are signed out."
        />
      ) : (
        <ul className="divide-y divide-c54-border-default">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="flex items-center gap-c54-3 px-c54-pad-lg py-c54-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-c54-sm text-c54-text-primary">{assignment.staff.name}</p>
                <p className="mt-c54-1 truncate text-c54-2xs text-c54-text-muted">
                  {assignment.asset.assetId} · {assignment.asset.description}
                </p>
              </div>
              <time
                dateTime={assignment.dateAssigned}
                className="shrink-0 text-c54-2xs text-c54-text-muted"
              >
                {formatRelative(assignment.dateAssigned, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="space-y-c54-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center gap-c54-3">
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Filter chips that double as links, so they work without JavaScript. */
export function QuickFilters({ className }: { className?: string }) {
  const chips = [
    { label: "Available now", query: { status: "AVAILABLE" } },
    { label: "Out for repair", query: { status: "UNDER_REPAIR" } },
    { label: "Assigned", query: { status: "ASSIGNED" } },
    { label: "Retired", query: { status: "RETIRED" } },
  ];

  return (
    <div className={className}>
      <p className="mb-c54-2 text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase">
        Jump to a filter
      </p>
      <div className="flex flex-wrap gap-c54-2">
        {chips.map((chip) => (
          <Link
            key={chip.label}
            href={buildHref("/assets", chip.query)}
            className="inline-flex h-7 items-center rounded-c54-button border border-c54-border-default bg-c54-bg-card px-c54-3 text-c54-xs text-c54-text-secondary transition-colors hover:border-c54-border-strong hover:text-c54-text-primary"
          >
            {chip.label}
          </Link>
        ))}
      </div>
    </div>
  );
}