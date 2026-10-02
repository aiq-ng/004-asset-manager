import Link from "next/link";
import { Suspense } from "react";

import { Badge, CodeChip } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Icons } from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import {
  ListSkeleton,
  QuickFilters,
  RecentAssetsSection,
  RecentAssignmentsSection,
  TotalsSection,
  TotalsSkeleton,
} from "@/features/dashboard/sections";
import { assetTotals, getDashboardData } from "@/features/dashboard/queries";
import {
  RegisterAssetButtonFallback,
  RegisterAssetTrigger,
} from "@/features/assets/register-asset-trigger";
import { listAssetTypes } from "@/lib/services/asset-types";
import { requirePageActor } from "@/lib/server/guard";
import { can } from "@/lib/auth/permissions";
import { formatRelative } from "@/lib/utils/format";

/**
 * Dashboard.
 *
 * The page itself awaits only the actor, then hands promises to its children so
 * each section streams in behind its own Suspense boundary. Counts and lists are
 * fetched independently, which is what keeps a slow audit-free aggregate from
 * holding back the rest of the page.
 */

/**
 * "Good morning" before noon, then afternoon and evening.
 *
 * Reads the `now` the page already captured rather than calling `new Date()`
 * again, so the greeting and the "held for N days" figures underneath it cannot
 * disagree about the time. This is server-rendered text with no client component
 * reading the clock beside it, so there is nothing that could hydrate to a
 * different greeting.
 */
function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const actor = await requirePageActor();

  // Started here, awaited in the sections: the request is in flight while the
  // shell renders, not after it.
  const totals = assetTotals();
  const data = getDashboardData(actor.id);
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow={
          <Badge tone="neutral" size="sm">
            {actor.department}
          </Badge>
        }
        title={`${greetingFor(now)}, ${actor.name.split(" ")[0]}`}
        description="Stock levels, recent activity, and what is currently in your hands."
        actions={
          can(actor.role, "asset:manage") ? (
            <Suspense fallback={<RegisterAssetButtonFallback />}>
              <RegisterAssetTrigger assetTypes={listAssetTypes()} />
            </Suspense>
          ) : null
        }
      />

      <div className="flex flex-col gap-c54-section">
        <Suspense fallback={<TotalsSkeleton />}>
          <TotalsSection totals={totals} />
        </Suspense>

        <div className="grid grid-cols-1 gap-c54-section lg:grid-cols-3">
          <div className="flex flex-col gap-c54-section lg:col-span-2">
            <Suspense fallback={<ListSkeleton />}>
              <RecentAssetsSection items={data.then((value) => ({ items: value.recent }))} />
            </Suspense>

            <Suspense fallback={<ListSkeleton />}>
              <RecentAssignmentsSection
                items={data.then((value) => ({ items: value.recentAssignments }))}
              />
            </Suspense>
          </div>

          <div className="flex flex-col gap-c54-section">
            <Card>
              <CardHeader>
                <CardTitle>Assigned to you</CardTitle>
              </CardHeader>
              <Suspense fallback={<ListSkeleton rows={3} />}>
                <MyAssetsSection items={data.then((value) => value.mine)} now={now} />
              </Suspense>
            </Card>

            <Card>
              <CardContent>
                <QuickFilters />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

async function MyAssetsSection({
  items,
  now,
}: {
  items: Promise<{
    total: number;
    items: {
      id: string;
      dateAssigned: string;
      asset: { assetId: string; description: string };
    }[];
  }>;
  now: Date;
}) {
  const { total, items: mine } = await items;

  return (
    <>
      {mine.length === 0 ? (
        <EmptyState
          icon={<Icons.Inbox className="size-5" />}
          title="Nothing assigned to you"
          description="Assets handed to you will be listed here."
        />
      ) : (
        <ul className="divide-y divide-c54-border-default">
          {mine.map((assignment) => (
            <li key={assignment.id}>
              <Link
                href={`/assets/${assignment.asset.assetId}`}
                className="flex items-center gap-c54-3 px-c54-pad-lg py-c54-3 transition-colors hover:bg-c54-action-ghost-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-c54-sm text-c54-text-primary">
                    {assignment.asset.description}
                  </p>
                  <p className="mt-c54-1 flex flex-wrap items-center gap-c54-2">
                    <CodeChip>{assignment.asset.assetId}</CodeChip>
                    <time dateTime={assignment.dateAssigned} className="text-c54-2xs text-c54-text-muted">
                      since {formatRelative(assignment.dateAssigned, now)}
                    </time>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > mine.length ? (
        <p className="border-t border-c54-border-default px-c54-pad-lg py-c54-3 text-c54-2xs text-c54-text-muted">
          Showing {mine.length} of {total}.{" "}
          <Link href="/assignments" className="text-c54-text-accent hover:underline">
            See all
          </Link>
        </p>
      ) : null}
    </>
  );
}