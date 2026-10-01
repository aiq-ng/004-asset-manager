import type { NextRequest } from "next/server";

import { apiRoute, ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { deleteStaff, getStaff, updateStaff } from "@/lib/services/staff";
import { staffIdParamSchema, updateStaffSchema } from "@/lib/validators/staff";

export const GET = apiRoute(async (_request: NextRequest, ctx: RouteContext<"/api/staff/[id]">) => {
  const { id } = parseOrThrow(staffIdParamSchema, await ctx.params);
  return ok(await getStaff(id));
});

export const PATCH = permissionRoute("staff:manage",
  async (request: NextRequest, ctx: RouteContext<"/api/staff/[id]">) => {
    const { id } = parseOrThrow(staffIdParamSchema, await ctx.params);
    const input = parseOrThrow(updateStaffSchema, await parseJsonBody(request));
    return ok(await updateStaff(id, input));
  },
);

export const DELETE = permissionRoute("staff:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/staff/[id]">) => {
    const { id } = parseOrThrow(staffIdParamSchema, await ctx.params);
    await deleteStaff(id);
    return ok({ id, deleted: true });
  },
);