import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, diffFields } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError, fromPrismaError } from "@/lib/errors";
import type { CreateAssetTypeInput, UpdateAssetTypeInput } from "@/lib/validators/asset-type";

export interface AssetTypeDto {
  id: string;
  name: string;
  code: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

function toDto(
  type: { id: string; name: string; code: string; createdAt: Date; updatedAt: Date; _count: { assets: number } },
): AssetTypeDto {
  return {
    id: type.id,
    name: type.name,
    code: type.code,
    assetCount: type._count.assets,
    createdAt: type.createdAt.toISOString(),
    updatedAt: type.updatedAt.toISOString(),
  };
}

export async function listAssetTypes(): Promise<AssetTypeDto[]> {
  const types = await prisma.assetType.findMany({
    include: { // Archived assets are counted out: this number is "how many of this type are on
  // the register", which is what an operator checks before renaming a code, and
  // a record they created by mistake is not on the register.
  _count: { select: { assets: { where: { archivedAt: null } } } } },
    orderBy: { name: "asc" },
  });

  return types.map(toDto);
}

export async function createAssetType(input: CreateAssetTypeInput): Promise<AssetTypeDto> {
  try {
    const created = await prisma.assetType.create({
      data: { name: input.name, code: input.code },
      include: { // Archived assets are counted out: this number is "how many of this type are on
  // the register", which is what an operator checks before renaming a code, and
  // a record they created by mistake is not on the register.
  _count: { select: { assets: { where: { archivedAt: null } } } } },
    });

    await recordAudit({
      action: AUDIT_ACTIONS.ASSET_TYPE_CREATED,
      entityType: "ASSET_TYPE",
      entityId: created.id,
      summary: `Created asset type ${created.code} (${created.name})`,
      metadata: { code: created.code, name: created.name },
    });

    return toDto(created);
  } catch (error) {
    throw fromPrismaError(error, "create asset type");
  }
}

export async function updateAssetType(
  id: string,
  input: UpdateAssetTypeInput,
): Promise<AssetTypeDto> {
  const existing = await prisma.assetType.findUnique({
    where: { id },
    include: { // Archived assets are counted out: this number is "how many of this type are on
  // the register", which is what an operator checks before renaming a code, and
  // a record they created by mistake is not on the register.
  _count: { select: { assets: { where: { archivedAt: null } } } } },
  });

  if (!existing) throw ApiError.notFound(`Asset type ${id} not found`);

  // Renaming the code would silently invalidate every generated asset id
  // (IT-LAP-0001 keeps "LAP" but the type would say "NOTEBOOK").
  if (input.code && input.code !== existing.code && existing._count.assets > 0) {
    throw ApiError.conflict(
      `Cannot change code: ${existing._count.assets} asset(s) already use "${existing.code}"`,
    );
  }

  try {
    const updated = await prisma.assetType.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
      },
      include: { // Archived assets are counted out: this number is "how many of this type are on
  // the register", which is what an operator checks before renaming a code, and
  // a record they created by mistake is not on the register.
  _count: { select: { assets: { where: { archivedAt: null } } } } },
    });

    const changes = diffFields(existing, input);
    if (Object.keys(changes).length > 0) {
      await recordAudit({
        action: AUDIT_ACTIONS.ASSET_TYPE_UPDATED,
        entityType: "ASSET_TYPE",
        entityId: updated.id,
        summary: `Updated asset type ${updated.code} (${Object.keys(changes).join(", ")})`,
        changes,
        metadata: { code: updated.code },
      });
    }

    return toDto(updated);
  } catch (error) {
    throw fromPrismaError(error, "update asset type");
  }
}