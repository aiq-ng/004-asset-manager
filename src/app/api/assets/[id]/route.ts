import type { NextRequest } from "next/server";

import { apiRoute, ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { can, requirePermission } from "@/lib/auth/permissions";
import { getAsset, retireAsset, updateAsset } from "@/lib/services/assets";
import {
  assetIdParamSchema,
  updateAssetSchema,
  updateAssetStatusSchema,
} from "@/lib/validators/asset";

export const GET = apiRoute(
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    return ok(await getAsset(id));
  },
);

/**
 * ADMIN and SUPERADMIN may edit anything on the asset. ASSIGNER may only change
 * `status` (flag it broken, put it back in the pool) - anything else in the body
 * is rejected by the strict status-only schema.
 */
export const PATCH = apiRoute(
  async (request: NextRequest, ctx: RouteContext<"/api/assets/[id]">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    const actor = await requireActor();
    requirePermission(actor, "asset:updateStatus");

    const input = parseOrThrow(
      can(actor.role, "asset:manage") ? updateAssetSchema : updateAssetStatusSchema,
      await parseJsonBody(request),
    );

    return ok(await updateAsset(id, input));
  },
);

export const DELETE = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    return ok(await retireAsset(id));
  },
);