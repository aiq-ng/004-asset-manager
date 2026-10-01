import type { NextRequest } from "next/server";

import { created, ok, parseFormData, parseOrThrow, permissionRoute } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { replaceAssetImage, removeAssetImage } from "@/lib/services/assets";
import { parseUploadedImage } from "@/lib/services/images";
import { assetIdParamSchema } from "@/lib/validators/asset";

export const POST = permissionRoute("asset:manage",
  async (request: NextRequest, ctx: RouteContext<"/api/assets/[id]/image">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    const formData = await parseFormData(request);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw ApiError.badRequest("Expected a multipart/form-data field named \"file\"", [
        { path: "file", message: "file is required" },
      ]);
    }

    const image = await parseUploadedImage(file);
    return created(await replaceAssetImage(id, image));
  },
);

export const DELETE = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]/image">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    return ok(await removeAssetImage(id));
  },
);