import type { NextRequest } from "next/server";

import { ok, parseOrThrow, permissionRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { archiveAsset } from "@/lib/services/assets";
import { assetIdParamSchema } from "@/lib/validators/asset";

/**
 * Archives an asset: the soft delete for a record created by mistake.
 *
 * A separate verb from `DELETE /api/assets/[id]`, which retires — a real device
 * leaving circulation and staying on the register. Archiving takes the row off
 * the register entirely, so it gets its own path rather than being folded into
 * the existing one.
 *
 * `asset:manage` (ADMIN and up), the same permission that creates and edits
 * assets: the people who can put a row on the register are the ones who can take
 * it off again. Reading the archive is a separate, equally admin-only
 * permission (`archive:read`).
 */
export const POST = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]/archive">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    const actor = await requireActor();
    return ok(await archiveAsset(id, actor));
  },
);