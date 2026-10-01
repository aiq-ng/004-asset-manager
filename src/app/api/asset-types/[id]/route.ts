import type { NextRequest } from "next/server";

import { ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { updateAssetType } from "@/lib/services/asset-types";
import { updateAssetTypeSchema } from "@/lib/validators/asset-type";

export const PATCH = permissionRoute("assetType:manage",
  async (request: NextRequest, ctx: RouteContext<"/api/asset-types/[id]">) => {
    const { id } = await ctx.params;
    const input = parseOrThrow(updateAssetTypeSchema, await parseJsonBody(request));
    return ok(await updateAssetType(id, input));
  },
);