import type { NextRequest } from "next/server";

import { ok, parseOrThrow, permissionRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { resendStaffInvite } from "@/lib/services/staff";
import { staffIdParamSchema } from "@/lib/validators/staff";

/**
 * Re-issues the invite email for a staff account: a new temporary password is
 * generated (the old one and any sessions die) and emailed to the member.
 *
 * Same tier as creating the account: invites hand out credentials, so only the
 * role that manages accounts may resend them.
 */
export const POST = permissionRoute(
  "staff:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/staff/[id]/resend-invite">) => {
    const { id } = parseOrThrow(staffIdParamSchema, await ctx.params);
    const result = await resendStaffInvite(id, await requireActor());

    return ok(result);
  },
);
