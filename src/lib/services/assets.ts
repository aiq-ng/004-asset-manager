import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, diffFields } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { buildObjectKey, getStorage } from "@/lib/storage";
import type { ParsedImage } from "@/lib/services/images";
import type { AssetDto, AssetDetailDto } from "@/lib/services/serializers";
import {
  assetInclude,
  assetWithHistoryInclude,
  toAssetDetailDto,
  toAssetDto,
  type AssetRecord,
} from "@/lib/services/serializers";
import { reserveAssetId } from "@/lib/services/asset-id";
import type {
  CreateAssetInput,
  ListAssetsQuery,
  UpdateAssetInput,
} from "@/lib/validators/asset";

/** Signs a presigned URL for the asset image, or returns null when there is none. */
async function signImage(imageKey: string | null): Promise<string | null> {
  if (!imageKey) return null;
  return getStorage().getPresignedUrl(imageKey);
}

/** Accepts either a database id or the human asset id (`IT-LAP-0001`), so QR scans resolve. */
function toAssetWhere(idOrAssetId: string): { id: string } | { assetId: string } {
  return idOrAssetId.startsWith("IT-") ? { assetId: idOrAssetId } : { id: idOrAssetId };
}

export async function listAssets(
  query: ListAssetsQuery,
): Promise<{ items: AssetDto[]; total: number; page: number; pageSize: number }> {
  const where = {
    ...(query.q
      ? {
          OR: [
            { assetId: { contains: query.q, mode: "insensitive" as const } },
            { serialNumber: { contains: query.q, mode: "insensitive" as const } },
            { description: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.type
      ? {
          assetType: {
            OR: [{ code: { equals: query.type, mode: "insensitive" as const } }, { id: query.type }],
          },
        }
      : {}),
    ...(query.assignedTo
      ? {
          assignments: {
            some: { staffId: query.assignedTo, dateReturned: null },
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: assetInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.asset.count({ where }),
  ]);

  const items = await Promise.all(
    rows.map(async (asset) => toAssetDto(asset, await signImage(asset.imageKey))),
  );

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getAsset(idOrAssetId: string): Promise<AssetDetailDto> {
  const asset = await prisma.asset.findUnique({
    where: toAssetWhere(idOrAssetId),
    include: assetWithHistoryInclude,
  });

  if (!asset) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  return toAssetDetailDto(asset, await signImage(asset.imageKey));
}

export async function createAsset(input: CreateAssetInput): Promise<AssetDto> {
  const assetType = await prisma.assetType.findFirst({
    where: {
      OR: [
        { code: { equals: input.assetType, mode: "insensitive" } },
        { id: input.assetType },
      ],
    },
  });

  if (!assetType) {
    throw ApiError.unprocessable(`Unknown asset type "${input.assetType}"`);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const assetId = await reserveAssetId(tx, assetType.id, assetType.code);

      return tx.asset.create({
        data: {
          assetId,
          assetTypeId: assetType.id,
          description: input.description,
          unit: input.unit,
          // "" is normalised to null by the validator so serial-less bulk items
          // do not collide on the unique constraint.
          serialNumber: input.serialNumber ?? null,
          status: input.status,
        },
        include: assetInclude,
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.ASSET_CREATED,
      entityType: "ASSET",
      entityId: created.id,
      summary: `Created asset ${created.assetId} (${assetType.code})`,
      metadata: {
        assetId: created.assetId,
        assetType: assetType.code,
        description: created.description,
        unit: created.unit,
        serialNumber: created.serialNumber,
        status: created.status,
      },
    });

    return toAssetDto(created, await signImage(created.imageKey));
  } catch (error) {
    throw fromPrismaError(error, "create asset");
  }
}

export async function updateAsset(
  idOrAssetId: string,
  input: UpdateAssetInput,
): Promise<AssetDto> {
  const existing = await prisma.asset.findUnique({ where: toAssetWhere(idOrAssetId) });
  if (!existing) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  if (input.status && existing.status === "ASSIGNED") {
    throw ApiError.unprocessable(
      "Asset is currently assigned; return it through the assignments endpoints before changing its status",
    );
  }

  let updated: AssetRecord;
  try {
    updated = await prisma.asset.update({
      where: { id: existing.id },
      data: {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.unit !== undefined ? { unit: input.unit } : {}),
        ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: assetInclude,
    });
  } catch (error) {
    throw fromPrismaError(error, "update asset");
  }

  const changes = diffFields(existing, input);
  if (Object.keys(changes).length > 0) {
    await recordAudit({
      action: AUDIT_ACTIONS.ASSET_UPDATED,
      entityType: "ASSET",
      entityId: updated.id,
      summary: `Updated asset ${updated.assetId} (${Object.keys(changes).join(", ")})`,
      changes,
      metadata: { assetId: updated.assetId },
    });
  }

  return toAssetDto(updated, await signImage(updated.imageKey));
}

/**
 * Soft delete: assets are retired, never removed, and their image is kept.
 * Refuses while the asset is checked out to somebody.
 */
export async function retireAsset(idOrAssetId: string): Promise<AssetDto> {
  const existing = await prisma.asset.findUnique({
    where: toAssetWhere(idOrAssetId),
    include: { assignments: { where: { dateReturned: null }, take: 1 } },
  });

  if (!existing) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  if (existing.assignments.length > 0 || existing.status === "ASSIGNED") {
    throw ApiError.conflict(
      "Asset is currently assigned; return it to staff before retiring it",
    );
  }

  const updated = await prisma.asset.update({
    where: { id: existing.id },
    data: { status: "RETIRED" },
    include: assetInclude,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_RETIRED,
    entityType: "ASSET",
    entityId: updated.id,
    summary: `Retired asset ${updated.assetId}`,
    changes: { status: { from: existing.status, to: "RETIRED" } },
    metadata: { assetId: updated.assetId },
  });

  return toAssetDto(updated, await signImage(updated.imageKey));
}

/**
 * Uploads the new object first, points the asset at it, then drops the previous
 * object. If the database write fails the fresh upload is removed again so no
 * orphan is left behind in the bucket.
 */
export async function replaceAssetImage(
  idOrAssetId: string,
  file: ParsedImage,
): Promise<AssetDto> {
  const existing = await prisma.asset.findUnique({ where: toAssetWhere(idOrAssetId) });
  if (!existing) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  const storage = getStorage();
  const newKey = buildObjectKey(existing.assetId, file.extension);
  await storage.uploadObject({
    key: newKey,
    body: file.buffer,
    contentType: file.contentType,
  });

  let updated: AssetRecord;
  try {
    updated = await prisma.asset.update({
      where: { id: existing.id },
      data: { imageKey: newKey },
      include: assetInclude,
    });
  } catch (error) {
    await storage.deleteObject(newKey).catch(() => undefined);
    throw fromPrismaError(error, "update asset image");
  }

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_IMAGE_UPLOADED,
    entityType: "ASSET",
    entityId: updated.id,
    summary: `Uploaded image for asset ${updated.assetId}`,
    changes: { imageKey: { from: existing.imageKey ?? null, to: newKey } },
    metadata: { assetId: updated.assetId, replaced: Boolean(existing.imageKey) },
  });

  const previousKey = existing.imageKey;
  if (previousKey && previousKey !== newKey) {
    // Best effort: the DB is already consistent, a stale object is preferable
    // to failing the request.
    await storage.deleteObject(previousKey).catch((error: unknown) => {
      console.error("[storage] failed to delete replaced object", previousKey, error);
    });
  }

  return toAssetDto(updated, await signImage(updated.imageKey));
}

export async function removeAssetImage(idOrAssetId: string): Promise<AssetDto> {
  const existing = await prisma.asset.findUnique({ where: toAssetWhere(idOrAssetId) });
  if (!existing) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  if (!existing.imageKey) {
    throw ApiError.unprocessable("Asset has no image to remove");
  }

  const key = existing.imageKey;
  const updated = await prisma.asset.update({
    where: { id: existing.id },
    data: { imageKey: null },
    include: assetInclude,
  });

  await getStorage()
    .deleteObject(key)
    .catch((error: unknown) => {
      console.error("[storage] failed to delete object", key, error);
    });

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_IMAGE_REMOVED,
    entityType: "ASSET",
    entityId: updated.id,
    summary: `Removed image from asset ${updated.assetId}`,
    changes: { imageKey: { from: key, to: null } },
    metadata: { assetId: updated.assetId },
  });

  return toAssetDto(updated, null);
}
