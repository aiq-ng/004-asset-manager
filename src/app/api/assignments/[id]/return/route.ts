import type { NextRequest } from "next/server";

import { ok, parseOrThrow, permissionRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { ApiError } from "@/lib/errors";
import { returnAssignment } from "@/lib/services/assignments";
import {
  assignmentIdParamSchema,
  returnAssignmentSchema,
} from "@/lib/validators/assignment";

export const POST = permissionRoute("assignment:return",
  async (request: NextRequest, ctx: RouteContext<"/api/assignments/[id]/return">) => {
    const { id } = parseOrThrow(assignmentIdParamSchema, await ctx.params);

    // The body stays optional — a bare POST returns the asset with no detail,
    // exactly like the original contract. When a body is present it may carry
    // `returnNote`; the return photo is a UI-only concern (multipart would need
    // a different parser here) and `returnedBy` is always the authenticated
    // actor, never client input.
    const raw = await request.text();
    let body: unknown = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        throw ApiError.badRequest("Request body must be valid JSON");
      }
    }
    const input = parseOrThrow(returnAssignmentSchema, body);

    return ok(await returnAssignment(id, input, await requireActor()));
  },
);
