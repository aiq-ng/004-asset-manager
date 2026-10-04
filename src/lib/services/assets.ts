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

/**
 * Presigned GET URL for any stored object key — return photos included.
 *
 * Return photos hang off assignment rows rather than assets, so the assignment
 * services keep their DTOs key-only and the pages that display a photo call
 * this per row. Keeping the signing at the read site means a list endpoint
 * never pays for signatures on rows nobody is looking at.
 */
export async function signStorageUrl(key: string): Promise<string> {
  return getStorage().getPresignedUrl(key);
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
            // Brand and model were unreachable from the search box: the column
            // existed and was editable, but "Dell" matched nothing. Both are
            // separate columns rather than being folded into `description`, so
            // they have to be named here to be findable at all.
            { brand: { contains: query.q, mode: "insensitive" as const } },
            { model: { contains: query.q, mode: "insensitive" as const } },
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
    ...(query.brand ? { brand: query.brand } : {}),
    ...(query.model ? { model: query.model } : {}),
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
export async function createAssetsInBulk(
  input: BulkAssetSubmitInput,
  image?: ParsedImage,
): Promise<BulkAssetResult> {
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
                description: input.name,
                brand: input.brand,
                model: input.model ?? null,
                serialNumber,
                status: input.status ?? "AVAILABLE",
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

  // The photo is attached here rather than by the caller looping
  // `replaceAssetImage`, for two reasons. It would otherwise put one
  // "uploaded image" audit event per row on top of the single batch event below,
  // which is exactly the per-row noise this function exists to avoid. And the
  // rows only exist by the time the transaction has committed, so there is
  // nothing to attach to before then.
  //
  // One object is stored per asset rather than one shared across the batch. A
  // shared key would be cheaper, but `removeAssetImage` deletes the object it
  // points at: taking the photo off one asset would leave the other nineteen
  // pointing at a deleted file. Per-asset keys keep that operation safe.
  if (image && created.length > 0) {
    for (const row of created) {
      await attachImageTo(row.assetId, image);
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
      description: input.name,
      brand: input.brand,
      count: created.length,
      assets: created,
      skipped,
      // Recorded as a boolean rather than the keys themselves: they are
      // derivable from the asset ids, and the audit trail has no reason to carry
      // twenty near-identical strings.
      imageAttached: Boolean(image) && created.length > 0,
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
          // Stored as typed. Folding the brand in as "Name (Brand)" made the
          // same word live in two columns and put it on the printed label twice
          // over; `brand` is its own column now.
          description: input.name,
          brand: input.brand,
          model: input.model ?? null,
          // Required on registration, so there is no "" to normalise here any
          // more: a serial-less item cannot be registered in the first place.
          serialNumber: input.serialNumber,
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
        brand: created.brand,
        model: created.model,
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
    const description =
      input.name !== undefined || input.brand !== undefined
        ? (() => {
            const name = input.name ?? existing.description.replace(/\s*\([^)]*\)$/, "");
            const brand = input.brand !== undefined ? input.brand : existing.brand;
            return brand ? `${name} (${brand})` : name;
          })()
        : undefined;

    updated = await prisma.asset.update({
      where: { id: existing.id },
      data: {
        ...(description !== undefined ? { description } : {}),
        ...(input.brand !== undefined ? { brand: input.brand } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
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
/**
 * Points a freshly created asset at an uploaded object.
 *
 * Distinct from `replaceAssetImage` because there is nothing to replace: the row
 * was created a moment ago and has no previous key, so there is no old object to
 * delete and no separate audit event worth writing — the creation event already
 * records that the asset exists.
 *
 * The upload happens before the database write so a failure leaves the reverse
 * problem to clean up, which is the one that can actually orphan bytes in the
 * bucket: if the write fails, the fresh object is removed again.
 */
async function attachImageTo(assetId: string, file: ParsedImage): Promise<void> {
  const storage = getStorage();
  const key = buildObjectKey(assetId, file.extension);

  await storage.uploadObject({ key, body: file.buffer, contentType: file.contentType });

  try {
    await prisma.asset.updateMany({ where: { assetId }, data: { imageKey: key } });
  } catch (error) {
    await storage.deleteObject(key).catch(() => undefined);
    throw fromPrismaError(error, "attach asset image");
  }
}

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
   * This is a rank on the register, not a quantity: one row is one physical item,
   * so there is no "six of these" for it to be confused with.
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
/**
 * The brand and model values actually in use, for the filter dropdowns.
 *
 * Read from the register rather than from a fixed list, because there is no
 * other place these come from: the alternative is free text on the register
 * form, which means the dropdown can only ever offer what somebody has already
 * typed. `distinct` with a `NULL` filter so the "Any brand" list is not padded
 * out with a blank row.
 *
 * Models are returned with the brand they were registered under, because the
 * model dropdown narrows to the chosen brand and needs to know the pairing
 * client-side to do it without another round trip.
 */
export async function listAssetFacets(): Promise<{
  brands: string[];
  models: { brand: string | null; model: string }[];
}> {
  const [brands, models] = await Promise.all([
    prisma.asset.findMany({
      where: { brand: { not: null } },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    prisma.asset.findMany({
      where: { model: { not: null } },
      distinct: ["model", "brand"],
      select: { brand: true, model: true },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
    }),
  ]);

  return {
    brands: brands.map((row) => row.brand!).filter(Boolean),
    models: models
      .filter((row): row is { brand: string | null; model: string } => Boolean(row.model))
      .map((row) => ({ brand: row.brand, model: row.model })),
  };
}

export async function listMatchingAssetIds(query: ListAssetsQuery): Promise<string[]> {
  const where = buildAssetWhere(query);
  const rows = await prisma.asset.findMany({ where, select: { assetId: true } });

  return rows.map((row) => row.assetId);
}
