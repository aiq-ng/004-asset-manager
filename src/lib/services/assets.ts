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
  BulkAssetSubmitInput,
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

/**
 * Translates a list query into a Prisma filter.
 *
 * Extracted so that "select all" on the register and the list itself can never
 * disagree about what the filter means — the one place that matters is a bulk
 * action: if these two ever drifted, selecting everything would quietly act on
 * a different set than the one on screen.
 */
function buildAssetWhere(query: ListAssetsQuery) {
  return {
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
}

export async function listAssets(
  query: ListAssetsQuery,
): Promise<{ items: AssetDto[]; total: number; page: number; pageSize: number }> {
  const where = buildAssetWhere(query);

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

/** One serial that could not be registered, and why. */
export interface SkippedAsset {
  serial: string;
  reason: string;
}

export interface CreatedAsset {
  assetId: string;
  /** Which serial this asset was created for, so the two can always be paired. */
  serial: string;
}

export interface BulkAssetResult {
  created: CreatedAsset[];
  skipped: SkippedAsset[];
}

/**
 * Registers a whole column of serials at once.
 *
 * Conflicts are found *before* anything is written, rather than by catching the
 * unique violation as it happens. Two reasons, both practical:
 *
 * - A failed statement aborts the surrounding Postgres transaction, so letting one
 *   duplicate raise would roll back the other ninety-nine. Screening first means
 *   the write transaction only ever runs statements that succeed.
 * - The person gets told exactly which serials were refused and why, instead of a
 *   generic failure for the whole batch. Registering ninety of a hundred is far
 *   more useful than registering none and asking them to find the typo.
 *
 * The check is a single `IN` query rather than one lookup per serial, so a hundred
 * rows cost one extra round trip rather than a hundred.
 *
 * Duplicates *within* the submitted column are caught the same way: a serial typed
 * twice on the sheet would otherwise fail against the row the same submission just
 * created. The first occurrence wins, so the asset ids still run down the column
 * in the order the person read them off.
 */
export async function createAssetsInBulk(input: BulkAssetSubmitInput): Promise<BulkAssetResult> {
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

  const skipped: SkippedAsset[] = [];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const serial of input.serials) {
    if (seen.has(serial)) {
      skipped.push({ serial, reason: "Entered more than once in this batch" });
      continue;
    }
    seen.add(serial);
    candidates.push(serial);
  }

  const existing = await prisma.asset.findMany({
    where: { serialNumber: { in: candidates } },
    select: { serialNumber: true },
  });
  const taken = new Set(existing.map((row) => row.serialNumber));

  const accepted = candidates.filter((serial) => {
    if (!taken.has(serial)) return true;
    skipped.push({ serial, reason: "Already on the register" });
    return false;
  });

  const created: CreatedAsset[] = [];

  if (accepted.length > 0) {
    try {
      created.push(
        ...(await prisma.$transaction(async (tx) => {
          const rows: CreatedAsset[] = [];
          for (const serialNumber of accepted) {
            const assetId = await reserveAssetId(tx, assetType.id, assetType.code);
            const row = await tx.asset.create({
              data: {
                assetId,
                assetTypeId: assetType.id,
                description: input.description,
                // One physical item per row: the quantity in this flow is the
                // number of rows being entered, not a per-row count.
                unit: 1,
                serialNumber,
                status: "AVAILABLE",
              },
              select: { assetId: true },
            });
            rows.push({ assetId: row.assetId, serial: serialNumber });
          }
          return rows;
        })),
      );
    } catch (error) {
      throw fromPrismaError(error, "create assets");
    }
  }

  // One audit event for the batch rather than one per row: a hundred-asset entry
  // would otherwise bury every other event in the trail under a hundred identical
  // "created asset" lines. The ids are on the event, so the detail is still there.
  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_CREATED,
    entityType: "ASSET",
    entityId: created[0]?.assetId ?? assetType.id,
    summary: `Registered ${created.length} asset${created.length === 1 ? "" : "s"} (${assetType.code})${
      skipped.length > 0 ? `, ${skipped.length} skipped` : ""
    }`,
    metadata: {
      assetType: assetType.code,
      description: input.description,
      count: created.length,
      assets: created,
      skipped,
    },
  });

  return { created, skipped };
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

export interface AssetLabelDto {
  assetId: string;
  device: string;
  /**
   * Position among the assets of this same type, counted in asset-id order.
   * This is deliberately *not* `Asset.unit`: that column is a quantity ("six of
   * these"), which on its own would print `006 of 250` for an asset that has
   * nothing to do with being the six hundredth thing on the shelf.
   */
  position: number;
  /** Assets of this type on the register — the denominator in `01 of 20`. */
  positionTotal: number;
  serialNumber: string | null;
}

/**
 * Resolves a selection of asset numbers for printing.
 *
 * Two things are deliberate here. The select list is narrow — a label needs the
 * number, the device name, the unit and the serial, so history, assignments and
 * signed image URLs are all left unqueried; that keeps a 100-label run to one
 * small query instead of 100 detail reads. And the result comes back in the order
 * the caller asked for, because a label sheet is sorted by asset number
 * wherever the labels came from, and re-sorting would scramble a run mid-print.
 *
 * Unknown numbers are dropped rather than thrown: a selection can go stale if an
 * asset is retired between the list page rendering and the sheet opening, and one
 * vanished asset should not cost the operator the other ninety-nine labels.
 */
export async function listAssetsForLabels(
  assetIds: string[],
): Promise<AssetLabelDto[]> {
  if (assetIds.length === 0) return [];

  const rows = await prisma.asset.findMany({
    where: { assetId: { in: assetIds } },
    select: {
      assetId: true,
      serialNumber: true,
      assetTypeId: true,
      assetType: { select: { name: true } },
    },
  });

  // Positions come from the register's own ordering rather than from any column
  // on the asset, so the numbers are right without anyone having to maintain
  // them. One ordered read per type covers both the totals and the ranks, which
  // keeps a hundred labels at two queries instead of a hundred.
  const typeIds = [...new Set(rows.map((row) => row.assetTypeId))];
  const fleet =
    typeIds.length === 0
      ? []
      : await prisma.asset.findMany({
          where: { assetTypeId: { in: typeIds } },
          select: { assetId: true, assetTypeId: true },
          orderBy: { assetId: "asc" },
        });

  const totals = new Map<string, number>();
  for (const row of fleet) {
    totals.set(row.assetTypeId, (totals.get(row.assetTypeId) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  const rank = new Map<string, { position: number; total: number }>();
  for (const row of fleet) {
    const position = (seen.get(row.assetTypeId) ?? 0) + 1;
    seen.set(row.assetTypeId, position);
    rank.set(row.assetId, { position, total: totals.get(row.assetTypeId) ?? 1 });
  }

  const byNumber = new Map(rows.map((row) => [row.assetId, row]));

  return assetIds.flatMap((assetId) => {
    const row = byNumber.get(assetId);
    if (!row) return [];

    return [
      {
        assetId: row.assetId,
        device: row.assetType.name,
        position: rank.get(row.assetId)?.position ?? 1,
        positionTotal: rank.get(row.assetId)?.total ?? 1,
        serialNumber: row.serialNumber,
      },
    ];
  });
}

/**
 * Every asset number matching a filter, ignoring pagination.
 *
 * Exists for bulk actions, where "select all" has to mean all of the filtered
 * set rather than the twenty rows currently on screen — with a hundred laptops
 * on the register, a page-scoped select-all would still mean ticking through five
 * pages by hand, which is the thing the bulk label sheet is meant to remove.
 *
 * Asset numbers only, never full rows: the caller needs identifiers to carry into
 * a label run, and a thousand identifiers is a payload a thousand documents are
 * not.
 */
export async function listMatchingAssetIds(query: ListAssetsQuery): Promise<string[]> {
  const where = buildAssetWhere(query);
  const rows = await prisma.asset.findMany({ where, select: { assetId: true } });

  return rows.map((row) => row.assetId);
}
