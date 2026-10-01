import type { NextRequest } from "next/server";

import { ok, parseOrThrow, permissionRoute } from "@/lib/api";
import { returnAssignment } from "@/lib/services/assignments";
import { assignmentIdParamSchema } from "@/lib/validators/assignment";

export const POST = permissionRoute("assignment:return",
  async (_request: NextRequest, ctx: RouteContext<"/api/assignments/[id]/return">) => {
    const { id } = parseOrThrow(assignmentIdParamSchema, await ctx.params);
    return ok(await returnAssignment(id));
  },
);