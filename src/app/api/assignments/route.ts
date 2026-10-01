import { apiRoute, created, ok, parseJsonBody, parseOrThrow, paginationMeta, permissionRoute, searchParamsToObject } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { createAssignment, listAssignments } from "@/lib/services/assignments";
import {
  createAssignmentSchema,
  listAssignmentsQuerySchema,
} from "@/lib/validators/assignment";

export const GET = apiRoute(async (request) => {
  const query = parseOrThrow(
    listAssignmentsQuerySchema,
    searchParamsToObject(request.nextUrl.searchParams),
  );
  const { items, total, page, pageSize } = await listAssignments(query);

  return ok(items, paginationMeta(page, pageSize, total));
});

export const POST = permissionRoute("assignment:create", async (request) => {
  const input = parseOrThrow(createAssignmentSchema, await parseJsonBody(request));
  return created(await createAssignment(input, await requireActor()));
});