import { apiRoute, created, ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { createAssetType, listAssetTypes } from "@/lib/services/asset-types";
import { createAssetTypeSchema } from "@/lib/validators/asset-type";

export const GET = apiRoute(async () => ok(await listAssetTypes()));

export const POST = permissionRoute("assetType:manage", async (request) => {
  const input = parseOrThrow(createAssetTypeSchema, await parseJsonBody(request));
  return created(await createAssetType(input));
});