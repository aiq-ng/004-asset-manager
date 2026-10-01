import { apiRoute, created, ok, parseJsonBody, parseOrThrow, paginationMeta, permissionRoute, searchParamsToObject } from "@/lib/api";
import { createStaff, listStaff } from "@/lib/services/staff";
import { createStaffSchema, listStaffQuerySchema } from "@/lib/validators/staff";

export const GET = apiRoute(async (request) => {
  const query = parseOrThrow(listStaffQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
  const { items, total, page, pageSize } = await listStaff(query);

  return ok(items, paginationMeta(page, pageSize, total));
});

export const POST = permissionRoute("staff:manage", async (request) => {
  const input = parseOrThrow(createStaffSchema, await parseJsonBody(request));
  return created(await createStaff(input));
});