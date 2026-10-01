import { ASSET_ID_PAD_LENGTH, ASSET_ID_PREFIX } from "@/lib/config";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** `IT-LAP-0001` — the human readable id printed on labels and encoded in QR codes. */
export function formatAssetId(typeCode: string, number: number): string {
  return `${ASSET_ID_PREFIX}-${typeCode}-${String(number).padStart(ASSET_ID_PAD_LENGTH, "0")}`;
}

/**
 * Atomically reserves the next sequence number for an asset type and returns the
 * formatted asset id.
 *
 * The `upsert` with `increment` lets Postgres row-lock the counter, so two
 * concurrent requests can never receive the same number. Numbers are never
 * reused: if the surrounding transaction later fails the gap simply stays.
 * Must be called inside the same transaction that creates the asset.
 */
export async function reserveAssetId(tx: Db, assetTypeId: string, typeCode: string): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { assetTypeId },
    create: { assetTypeId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return formatAssetId(typeCode, counter.lastNumber);
}