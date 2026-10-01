import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiRoute, parseOrThrow } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/errors";
import { renderQrCode } from "@/lib/services/qr";
import { assetIdParamSchema } from "@/lib/validators/asset";

const querySchema = z.object({
  format: z.enum(["png", "svg"]).default("png"),
  // "1" / "true" / "" all mean download.
  download: z
    .string()
    .optional()
    .transform((value) => value === "1" || value === "true" || value === ""),
});

/**
 * QR codes are generated on demand from `{APP_URL}/assets/{assetId}` and are
 * never written to object storage.
 */
export const GET = apiRoute(
  async (request: NextRequest, ctx: RouteContext<"/api/assets/[id]/qr">) => {
    const { id } = parseOrThrow(assetIdParamSchema, await ctx.params);
    const { format, download } = parseOrThrow(querySchema, {
      ...Object.fromEntries(request.nextUrl.searchParams),
    });

    const asset = await prisma.asset.findUnique({
      where: id.startsWith("IT-") ? { assetId: id } : { id },
      select: { assetId: true },
    });

    if (!asset) throw ApiError.notFound(`Asset ${id} not found`);

    const qr = await renderQrCode(asset.assetId, format);

    const headers = new Headers({
      "Content-Type": qr.contentType,
      "Cache-Control": "private, no-store",
    });

    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${asset.assetId}.${format}"`);
    }

    return new NextResponse(qr.body as BodyInit, { headers });
  },
);