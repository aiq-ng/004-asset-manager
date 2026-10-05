import Link from "next/link";
import { Suspense } from "react";
import { Building2, ChevronRight, Inbox, Laptop, Layers, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CodeChip } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
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
import { can } from "@/lib/auth/permissions";
import { requirePageActor } from "@/lib/server/guard";
import { formatRelative } from "@/lib/utils/format";

/**
 * Dashboard.
 *
 * The page awaits only the actor, then hands promises to its children so each
 * section streams in behind its own Suspense boundary. Counts and lists are
 * fetched independently, so a slow aggregate cannot hold back the rest.
 */

// The office's timezone. The server clock is usually UTC, which would make the
// greeting wrong for local staff.
const DASHBOARD_TIME_ZONE = "Africa/Lagos";

const hourFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: DASHBOARD_TIME_ZONE,
});

const todayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: DASHBOARD_TIME_ZONE,
});

/**
 * Reads the `now` the page already captured, so the greeting and the
 * "since N days" figures underneath cannot disagree about the time.
 */
function greetingFor(now: Date): string {
  const hour = Number(hourFormat.format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

type QuickAction = {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  show: boolean;
};

/**
 * Primary actions, one click from the landing page.
 *
 * Each links to the page that hosts its sheet with `?new`, which opens that
 * sheet on arrival — see `features/shared/create-sheet-param`. Not `/staff/new`
 * and friends: those are not routes, and `/assets/new` was the worst of them,
 * since it matched `/assets/[assetId]` on the literal string `new` and rendered
 * a 404 that read like a missing asset.
 */
function QuickActions({ actions }: { actions: QuickAction[] }) {
  const visible = actions.filter((action) => action.show);
  if (visible.length === 0) return null;

  return (
    <nav aria-label="Quick actions" className="grid grid-cols-1 gap-c54-3 sm:grid-cols-2 lg:grid-cols-4">
      {visible.map(({ label, hint, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex items-center gap-c54-3 rounded-c54-card border border-c54-border-default bg-c54-bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-c54-border-accent hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-c54-bg-accent text-c54-text-accent transition-colors group-hover:bg-c54-action-primary group-hover:text-c54-action-primary-fg">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-c54-sm font-semibold text-c54-text-primary">{label}</span>
            <span className="mt-0.5 block truncate text-c54-2xs text-c54-text-muted">{hint}</span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-c54-text-muted transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      ))}
    </nav>
  );
}

export default async function DashboardPage() {
  const actor = await requirePageActor();

  // Started here, awaited in the sections: the requests are in flight while
  // the shell renders, not after it.
  const totals = assetTotals();
  const data = getDashboardData(actor.id);
  const now = new Date();

  // Whether to offer each action at all. Read from the same permission matrix
  // the destination pages gate their own create buttons on, so the dashboard
  // cannot offer a button the page will refuse to open — the exact mismatch that
  // had this hard-coded to `true` and showed every account, including a plain
  // USER, a row of management links that all led to sheets they could not use.
  //
  // This is presentation, not authorisation. Hiding a link is a usability
  // decision; the pages and the server actions behind them still enforce it.
  const canManageAssets = can(actor.role, "asset:manage");
  const canManageTypes = can(actor.role, "assetType:manage");
  const canManageStaff = can(actor.role, "staff:manage");
  const canManageDepartments = can(actor.role, "department:manage");

  const actions: QuickAction[] = [
    { label: "Add asset", hint: "Register new equipment", href: "/assets?new", icon: Laptop, show: canManageAssets },
    { label: "Add asset type", hint: "New category and id prefix", href: "/asset-types?new", icon: Layers, show: canManageTypes },
    { label: "Add staff", hint: "Invite a team member", href: "/staff?new", icon: UserPlus, show: canManageStaff },
    { label: "Add department", hint: "Create a new department", href: "/departments?new", icon: Building2, show: canManageDepartments },
  ];

  return (
    <>
      <PageHeader
        title={`${greetingFor(now)}, ${actor.name.split(" ")[0]}`}
        description={`${todayFormat.format(now)} · Stock levels, recent activity, and what is currently in your hands.`}
      />

      <div className="flex flex-col gap-c54-section">
        <QuickActions actions={actions} />

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
          icon={<Inbox className="size-5" />}
          title="Nothing assigned to you"
          description="Assets handed to you will be listed here."
        />
      ) : (
        <ul className="divide-y divide-c54-border-default">
          {mine.map((assignment) => (
            <li key={assignment.id}>
              <Link
                href={`/assets/${assignment.asset.assetId}`}
                className="group flex items-center gap-c54-3 px-c54-pad-lg py-c54-3 transition-colors hover:bg-c54-action-ghost-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-c54-sm text-c54-text-primary">
                    {assignment.asset.description}
                  </p>
                  <p className="mt-c54-1 flex flex-wrap items-center gap-c54-2">
                    <CodeChip>{assignment.asset.assetId}</CodeChip>
                    <time
                      dateTime={assignment.dateAssigned}
                      className="text-c54-2xs text-c54-text-muted"
                    >
                      since {formatRelative(assignment.dateAssigned, now)}
                    </time>
                  </p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-c54-text-muted transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
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