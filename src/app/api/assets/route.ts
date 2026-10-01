import { apiRoute, created, ok, parseJsonBody, parseOrThrow, paginationMeta, permissionRoute, searchParamsToObject } from "@/lib/api";
import { createAsset, listAssets } from "@/lib/services/assets";
import { createAssetSchema, listAssetsQuerySchema } from "@/lib/validators/asset";

export const GET = apiRoute(async (request) => {
  const query = parseOrThrow(listAssetsQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
  const { items, total, page, pageSize } = await listAssets(query);

  return ok(items, paginationMeta(page, pageSize, total));
});

export const POST = permissionRoute("asset:manage", async (request) => {
  const input = parseOrThrow(createAssetSchema, await parseJsonBody(request));
  return created(await createAsset(input));
});