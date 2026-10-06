import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { generateDevicePin } from "@/lib/auth/device-pin";
import { DEVICE_PIN_LENGTH, DEVICE_PIN_PATTERN } from "@/lib/auth/device-pin-policy";
import type { Actor } from "@/lib/auth/permissions";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/**
 * Device PINs: the short numeric code a device is unlocked with.
 *
 * The companion to `asset-passwords.ts`, and deliberately a copy of its shape
 * rather than a generalisation of it. They answer the same question — "how do I
 * get into this thing" — with two different credentials, and folding them into
 * one service would mean a `kind` argument threaded through every call site for
 * no gain: the columns differ, the audit actions differ, and the two have to be
 * able to move independently later.
 *
 * The three properties from the password module hold here unchanged:
 *
 *  - **Nothing else reads the column.** `AssetRecord` selects the asset row
 *    whole, so the PIN travels with every list and detail read. It is not in
 *    `AssetDto`, it is not in `PublicAssetDto`, and the only function here that
 *    returns it is `revealDevicePin`. Do not add it to a serializer.
 *  - **Every read is recorded.** `revealDevicePin` writes an audit row before it
 *    returns, including on failure, so "who looked at this PIN" is answerable.
 *  - **The value never reaches the audit trail.** Not in `changes`, not in
 *    `metadata`, not in the summary — and `REDACTED_KEYS` covers a caller who
 *    passes one by mistake.
 *
 * Storage is plaintext for the same reasons as `password`; see the `pin` field
 * comment in `prisma/schema.prisma`. The one difference worth naming is that a
 * 4-digit PIN has so little entropy that hashing it would be close to pointless
 * anyway — a rainbow table of 10^4 entries is a spreadsheet — so the honest
 * control is the audit trail and the `asset:manage` gate, not the column's
 * encoding.
 */

/** What a caller is told about a stored PIN without being told the PIN. */
export interface DevicePinStatus {
  /** When it was last set, so "unchanged since March" is answerable. */
  setAt: string;
  /** Who set it; null if that account has since been deleted. */
  setBy: string | null;
}

/**
 * The projection every read here uses.
 *
 * An explicit `select` rather than the shared `assetInclude`, for the same
 * reason `getPublicAsset` and `asset-passwords.ts` do their own: this query
 * exists precisely to touch the PIN, and paying for the assignment history and
 * three staff joins on each row only to throw them away would be reading a
 * secret with a pile of ordinary reads nobody asked for.
 */
const devicePinSelect = {
  id: true,
  assetId: true,
  pin: true,
  pinSetAt: true,
  pinSetBy: { select: { name: true } },
  assetType: { select: { code: true } },
  archivedAt: true,
} as const;

/**
 * Looks up the stored PIN for one asset.
 *
 * `findFirst` rather than `findUnique` because `assetId` and `id` cannot both be
 * indexed, and callers address assets by either. Archived rows are excluded so
 * that a record somebody hid cannot be probed by guessing an id — the same rule
 * as every other single-asset read in `services/assets.ts`.
 */
async function findPinRow(idOrAssetId: string) {
  const where = idOrAssetId.startsWith("IT-") ? { assetId: idOrAssetId } : { id: idOrAssetId };

  const row = await prisma.asset.findFirst({
    where: { ...where, archivedAt: null },
    select: devicePinSelect,
  });

  if (!row) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  return row;
}

/**
 * Enforces the format at the service boundary, not only in the Zod schema.
 *
 * The validator runs first for every UI and REST caller, so this is the check
 * that matters for anything else — a script posting straight to the endpoint, a
 * future action that reuses `setDevicePin` with a hand-built schema, a seed
 * script. `DEVICE_PIN_LENGTH` and `DEVICE_PIN_PATTERN` come from the policy
 * module both this and the form read, so the rule cannot drift into two.
 */
function assertPinFormat(pin: string): void {
  if (pin.length !== DEVICE_PIN_LENGTH || !DEVICE_PIN_PATTERN.test(pin)) {
    const message = `PIN must be exactly ${DEVICE_PIN_LENGTH} digits`;
    throw ApiError.badRequest(message, [{ path: "pin", message }]);
  }
}

/**
 * Whether an asset has a PIN stored, plus when and by whom.
 *
 * Reads only the metadata columns. A list of assets that recorded "revealed" for
 * every row it merely displayed would make the reveal trail useless.
 */
export async function getDevicePinStatus(
  idOrAssetId: string,
): Promise<DevicePinStatus | null> {
  const row = await findPinRow(idOrAssetId);

  if (!row.pin || !row.pinSetAt) return null;

  return {
    setAt: row.pinSetAt.toISOString(),
    setBy: row.pinSetBy?.name ?? null,
  };
}

/**
 * Writes and audits — the one place a stored PIN changes hands.
 *
 * Both write paths go through here so there is exactly one definition of what
 * "setting a device PIN" means: one attribution, one audit row, and a `changes`
 * diff that never carries the value. `source` is the only difference between
 * them, recorded for the same reason as the password's.
 */
async function persistDevicePin(
  row: Awaited<ReturnType<typeof findPinRow>>,
  pin: string,
  actor: Actor,
  source: "manual" | "generated",
): Promise<DevicePinStatus> {
  const setAt = new Date();

  let updated;
  try {
    updated = await prisma.asset.update({
      where: { id: row.id },
      data: {
        pin,
        pinSetAt: setAt,
        // From the session, never from the request body, so the attribution
        // cannot be forged by a caller.
        pinSetById: actor.id,
      },
      select: { pinSetAt: true, pinSetBy: { select: { name: true } } },
    });
  } catch (error) {
    throw fromPrismaError(error, "set device PIN");
  }

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_PIN_SET,
    entityType: "ASSET",
    entityId: row.id,
    summary: `${source === "generated" ? "Generated" : "Set"} device PIN for ${row.assetId} (${row.assetType.code})`,
    changes: {
      // Booleans on both sides, not the value: the question this row answers is
      // "was there one before, is there one now".
      pin: { from: Boolean(row.pin), to: true },
    },
    metadata: {
      assetId: row.assetId,
      assetType: row.assetType.code,
      source,
      replaced: Boolean(row.pin),
      // No length here, unlike the password's manual path: a PIN's length is
      // fixed by policy, so recording it would say nothing that the format does
      // not already imply.
    },
  });

  return {
    setAt: updated.pinSetAt!.toISOString(),
    setBy: updated.pinSetBy?.name ?? null,
  };
}

/**
 * Stores a PIN somebody chose.
 *
 * The value is passed in rather than generated because a device often already
 * has a PIN the admin is being told to record — the same case that makes the
 * password's manual path necessary. It is trimmed first, then checked against
 * the format, so ` 1234 ` is stored as `1234` and `12345` is refused rather than
 * silently truncated to something the device will not accept.
 *
 * Returns the stored plaintext alongside the status for the same reason
 * `generateAndSetDevicePin` does: the caller now knows exactly the value that
 * opens the device, and handing it back spares them a second, separately audited
 * reveal just to display what they already typed.
 */
export async function setDevicePin(
  idOrAssetId: string,
  plaintext: string,
  actor: Actor,
): Promise<{ pin: string; status: DevicePinStatus }> {
  const row = await findPinRow(idOrAssetId);

  const pin = plaintext.trim();
  assertPinFormat(pin);

  return { pin, status: await persistDevicePin(row, pin, actor, "manual") };
}

/**
 * Generates a fresh PIN, stores it and hands the plaintext back once.
 *
 * The only path that both produces a value and persists it, because a generated
 * PIN that nobody stored is worthless: the whole promise is that the register
 * still knows it in a year. The plaintext is returned rather than re-read, so
 * the value crosses the server boundary exactly once, on the request that
 * created it.
 */
export async function generateAndSetDevicePin(
  idOrAssetId: string,
  actor: Actor,
): Promise<{ pin: string; status: DevicePinStatus }> {
  const row = await findPinRow(idOrAssetId);

  const pin = generateDevicePin();

  return { pin, status: await persistDevicePin(row, pin, actor, "generated") };
}

/**
 * Reads a stored PIN back.
 *
 * Audited on every call, including a failed one: "somebody kept trying to read
 * this PIN" is the more interesting row of the two, and it would be the one
 * missing if the event were written after the read succeeded.
 *
 * Takes no `actor`: who read the PIN comes from the ambient request context,
 * which `recordAudit` picks up from the wrapper that already resolved the
 * session. The permission check happens at the entry point, so this is only
 * reachable by an ADMIN.
 */
export async function revealDevicePin(idOrAssetId: string): Promise<string> {
  const row = await findPinRow(idOrAssetId);

  const auditReveal = (outcome: "revealed" | "unreadable") =>
    recordAudit({
      action: AUDIT_ACTIONS.ASSET_PIN_REVEALED,
      entityType: "ASSET",
      entityId: row.id,
      summary: `Read device PIN for ${row.assetId} (${row.assetType.code})`,
      // The outcome rather than the value, in a `security` row: this is the log
      // an investigation reads, and "read, successfully" vs "read, failed" is
      // what it has to distinguish.
      metadata: {
        assetId: row.assetId,
        assetType: row.assetType.code,
        outcome,
        // Set at the time of the read, not at set time — the age of the PIN is
        // often the answer to "why does this not work any more".
        pinAgeDays: row.pinSetAt
          ? Math.floor((Date.now() - row.pinSetAt.getTime()) / 86_400_000)
          : null,
      },
    });

  if (!row.pin) {
    await auditReveal("unreadable");
    throw ApiError.notFound(`No device PIN is stored for ${row.assetId}`);
  }

  await auditReveal("revealed");
  return row.pin;
}

/**
 * Forgets a stored PIN.
 *
 * Offered for the same reason as the password's: a device that has been
 * re-enrolled has a different code, and keeping one that no longer opens it is
 * worse than keeping none. Clearing leaves an audit row, so the gap in the
 * history is visible.
 */
export async function clearDevicePin(idOrAssetId: string): Promise<void> {
  const row = await findPinRow(idOrAssetId);

  if (!row.pin) {
    throw ApiError.notFound(`No device PIN is stored for ${row.assetId}`);
  }

  await prisma.asset.update({
    where: { id: row.id },
    data: { pin: null, pinSetAt: null, pinSetById: null },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_PIN_CLEARED,
    entityType: "ASSET",
    entityId: row.id,
    summary: `Cleared device PIN for ${row.assetId} (${row.assetType.code})`,
    changes: { pin: { from: true, to: null } },
    metadata: {
      assetId: row.assetId,
      assetType: row.assetType.code,
      setAt: row.pinSetAt?.toISOString() ?? null,
      setBy: row.pinSetBy?.name ?? null,
    },
  });
}
