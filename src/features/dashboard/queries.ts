import "server-only";

import { listAssets } from "@/lib/services/assets";
import { listAssignments } from "@/lib/services/assignments";
import type { AssetStatus } from "@/features/assets/asset-status";

/**
 * Dashboard aggregates.
 *
 * Built from the existing services rather than raw Prisma, so the dashboard can
 * never show a number the API would refuse to serve. Each status total is one
 * `pageSize: 1` list call — the count is the same query the list screen runs, so
 * the two can never disagree.
 */
export interface AssetTotals {
  all: number;
  available: number;
  assigned: number;
  underRepair: number;
  retired: number;
}

export async function assetTotals(): Promise<AssetTotals> {
  const count = async (status: AssetStatus) =>
    (await listAssets({ page: 1, pageSize: 1, status })).total;

  const [all, available, assigned, underRepair, retired] = await Promise.all([
    listAssets({ page: 1, pageSize: 1 }).then((result) => result.total),
    count("AVAILABLE"),
    count("ASSIGNED"),
    count("UNDER_REPAIR"),
    count("RETIRED"),
  ]);

  return { all, available, assigned, underRepair, retired };
}

export interface DashboardData {
  totals: AssetTotals;
  mine: { total: number; items: Awaited<ReturnType<typeof listAssignments>>["items"] };
  recent: Awaited<ReturnType<typeof listAssets>>["items"];
  recentAssignments: Awaited<ReturnType<typeof listAssignments>>["items"];
}

export async function getDashboardData(staffId: string): Promise<DashboardData> {
  const [totals, recent, mine, recentAssignments] = await Promise.all([
    assetTotals(),
    listAssets({ page: 1, pageSize: 6 }),
    listAssignments({ page: 1, pageSize: 5, staffId, active: true }),
    listAssignments({ page: 1, pageSize: 5, active: true }),
  ]);

  return {
    totals,
    recent: recent.items,
    mine: { total: mine.total, items: mine.items },
    recentAssignments: recentAssignments.items,
  };
}