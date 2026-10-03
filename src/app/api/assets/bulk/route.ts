import { created, ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { createAssetsInBulk } from "@/lib/services/assets";
import { bulkAssetSubmitSchema } from "@/lib/validators/asset";

export const POST = permissionRoute("asset:manage", async (request) => {
  const input = parseOrThrow(bulkAssetSubmitSchema, await parseJsonBody(request));
  const result = await createAssetsInBulk(input);

  return result.skipped.length > 0 ? ok(result) : created(result);
});
