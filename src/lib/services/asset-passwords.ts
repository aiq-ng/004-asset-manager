import "server-only";

import { AUDIT_ACTIONS } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { generateDevicePassword } from "@/lib/auth/device-password";
import type { Actor } from "@/lib/auth/permissions";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

/**
 * Device passwords: the credential an asset itself is protected by.
 *
 * The requirement this exists for is "the superadmin or an admin always knows
 * the password of every laptop". That rules out hashing — `Staff.passwordHash`
 * verifies and can never be read back, which is right for an account and useless
 * here — and the deployment also chose plaintext over encryption: a key held in
 * the environment is a second thing to back up and never lose, and losing it
 * loses every stored password at once. See the `password` field comment in
 * `prisma/schema.prisma` for the full trade.
 *
 * Three properties the rest of the app depends on, and which are the reason this
 * is one module rather than three functions spread across the asset services:
 *
 *  - **Nothing else reads the column.** `AssetRecord` selects the asset row
 *    whole, so the value travels with every list and detail read. It is not in
 *    `AssetDto`, and it is not in `PublicAssetDto`, and the only function here
 *    returns it. Do not add it to a serializer to "save a round trip".
 *  - **Every read is recorded.** `revealDevicePassword` writes an audit row
 *    before it returns, so "who printed this laptop's password" is answerable
 *    after the fact.
 *  - **The value never reaches the audit trail.** Not in `changes`, not in
 *    `metadata`, not in the summary. What is recorded is that it changed, when,
 *    and by whom.
 *
 * What plaintext does mean: anyone with database read access — a `pg_dump`, a
 * backup, a read-only SQL account — can read every device password at once. That
 * is the accepted trade for not having a key to manage; the database's own access
 * controls are the boundary, as they already are for every serial number and
 * staff email in the schema.
 */

/** What a caller is told about a stored password without being told the password. */
export interface DevicePasswordStatus {
  /** When it was last set, so "unchanged since March" is answerable. */
  setAt: string;
  /** Who set it; null if that account has since been deleted. */
  setBy: string | null;
}

/**
 * The projection every read here uses.
 *
 * An explicit `select` rather than the shared `assetInclude`, for the same reason
 * `getPublicAsset` does its own: this query exists precisely to touch the
 * password, and reading the assignment history and three staff joins on each row
 * to throw it away would be paying for a secret read with a pile of ordinary
 * reads nobody asked for.
 */
const devicePasswordSelect = {
  id: true,
  assetId: true,
  password: true,
  passwordSetAt: true,
  passwordSetBy: { select: { name: true } },
  assetType: { select: { code: true } },
  archivedAt: true,
} as const;

/**
 * Looks up the stored credential for one asset.
 *
 * `findFirst` rather than `findUnique` because `assetId` and `id` cannot both be
 * indexed, and callers address assets by either. Archived rows are excluded so
 * that a record somebody hid cannot be probed for its credential by guessing an
 * id — the same rule as every other single-asset read in `services/assets.ts`.
 */
async function findPasswordRow(idOrAssetId: string) {
  const where = idOrAssetId.startsWith("IT-") ? { assetId: idOrAssetId } : { id: idOrAssetId };

  const row = await prisma.asset.findFirst({
    where: { ...where, archivedAt: null },
    select: devicePasswordSelect,
  });

  if (!row) throw ApiError.notFound(`Asset ${idOrAssetId} not found`);

  return row;
}

/**
 * Whether an asset has a password stored, plus when and by whom.
 *
 * Reads only the metadata columns. A list of assets that recorded "revealed" for
 * every row it merely displayed would make the reveal trail useless.
 */
export async function getDevicePasswordStatus(
  idOrAssetId: string,
): Promise<DevicePasswordStatus | null> {
  const row = await findPasswordRow(idOrAssetId);

  if (!row.password || !row.passwordSetAt) return null;

  return {
    setAt: row.passwordSetAt.toISOString(),
    setBy: row.passwordSetBy?.name ?? null,
  };
}

/**
 * Writes and audits — the one place a stored credential changes hands.
 *
 * Both write paths go through here so there is exactly one definition of what
 * "setting a device password" means: one attribution, one audit row, and a
 * `changes` diff that never carries the value. `source` is the only difference
 * between them, and it is recorded because a generated code is known to be unique
 * to this device while a typed one may well not be.
 */
async function persistDevicePassword(
  row: Awaited<ReturnType<typeof findPasswordRow>>,
  password: string,
  actor: Actor,
  source: "manual" | "generated",
): Promise<DevicePasswordStatus> {
  const setAt = new Date();

  let updated;
  try {
    updated = await prisma.asset.update({
      where: { id: row.id },
      data: {
        password,
        passwordSetAt: setAt,
        // From the session, never from the request body, so the attribution
        // cannot be forged by a caller.
        passwordSetById: actor.id,
      },
      select: { passwordSetAt: true, passwordSetBy: { select: { name: true } } },
    });
  } catch (error) {
    throw fromPrismaError(error, "set device password");
  }

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_PASSWORD_SET,
    entityType: "ASSET",
    entityId: row.id,
    summary: `${source === "generated" ? "Generated" : "Set"} device password for ${row.assetId} (${row.assetType.code})`,
    changes: {
      // Booleans on both sides, not the value: the question this row answers is
      // "was there one before, is there one now".
      password: { from: Boolean(row.password), to: true },
    },
    metadata: {
      assetId: row.assetId,
      assetType: row.assetType.code,
      source,
      // Only the manual path records a length. For a generated code it is
      // derivable from the format and says nothing.
      ...(source === "manual" ? { length: password.length } : {}),
      replaced: Boolean(row.password),
    },
  });

  return {
    setAt: updated.passwordSetAt!.toISOString(),
    setBy: updated.passwordSetBy?.name ?? null,
  };
}

/**
 * Stores a password somebody chose.
 *
 * The value is passed in, not generated, because an admin frequently configures
 * the laptop themselves and then records what they set — that is the case where a
 * generated code is useless, because the device already has a different password.
 * Whitespace is trimmed here rather than trusted from the form: a trailing space
 * that is invisible on screen is the classic "this password is wrong" support
 * call, and storing the trimmed value is what the admin will type next time.
 *
 * Returns the stored plaintext alongside the status for the same reason
 * `generateAndSetDevicePassword` does: the caller is holding exactly the value
 * that now opens the device, and handing it back spares them a second, separately
 * audited reveal just to display what they already know. Both write paths
 * returning `{ password, status }` is also what keeps the two interchangeable
 * behind one UI.
 */
export async function setDevicePassword(
  idOrAssetId: string,
  plaintext: string,
  actor: Actor,
): Promise<{ password: string; status: DevicePasswordStatus }> {
  const row = await findPasswordRow(idOrAssetId);

  const password = plaintext.trim();
  if (password.length === 0) {
    throw ApiError.badRequest("Password must not be empty", [
      { path: "password", message: "Password must not be empty" },
    ]);
  }

  return { password, status: await persistDevicePassword(row, password, actor, "manual") };
}

/**
 * Generates a fresh password, stores it and hands the plaintext back once.
 *
 * The only path that both produces a value and persists it, because a generated
 * code that nobody stored is worthless: the whole promise is that the register
 * still knows the password in a year. The plaintext is returned rather than
 * re-read, so the value crosses the server boundary exactly once, on the request
 * that created it.
 */
export async function generateAndSetDevicePassword(
  idOrAssetId: string,
  actor: Actor,
): Promise<{ password: string; status: DevicePasswordStatus }> {
  const row = await findPasswordRow(idOrAssetId);

  // Keyed on the asset type so the code reads as `LAP-K7QM-3XB4` — see
  // `lib/auth/device-password.ts` for why the format is shaped that way.
  const password = generateDevicePassword(row.assetType.code);

  return { password, status: await persistDevicePassword(row, password, actor, "generated") };
}

/**
 * Reads a stored password back.
 *
 * Audited on every call, including a failed one: "somebody kept trying to read
 * this credential" is the more interesting row of the two, and it would be the
 * one missing if the event were written after the read succeeded.
 *
 * Takes no `actor`: who read the password comes from the ambient request
 * context, which `recordAudit` picks up from the wrapper that already resolved
 * the session. The permission check happens at the entry point, so this is only
 * reachable by an ADMIN.
 */
export async function revealDevicePassword(idOrAssetId: string): Promise<string> {
  const row = await findPasswordRow(idOrAssetId);

  const auditReveal = (outcome: "revealed" | "unreadable") =>
    recordAudit({
      action: AUDIT_ACTIONS.ASSET_PASSWORD_REVEALED,
      entityType: "ASSET",
      entityId: row.id,
      summary: `Read device password for ${row.assetId} (${row.assetType.code})`,
      // The outcome rather than the value, in a `security` row: this is the log
      // an investigation reads, and "read, successfully" vs "read, failed" is
      // what it has to distinguish.
      metadata: {
        assetId: row.assetId,
        assetType: row.assetType.code,
        outcome,
        // Set at the time of the read, not at set time — the age of the password
        // is often the answer to "why does this not work any more".
        passwordAgeDays: row.passwordSetAt
          ? Math.floor((Date.now() - row.passwordSetAt.getTime()) / 86_400_000)
          : null,
      },
    });

  if (!row.password) {
    await auditReveal("unreadable");
    throw ApiError.notFound(`No device password is stored for ${row.assetId}`);
  }

  await auditReveal("revealed");
  return row.password;
}

/**
 * Forgets a stored password.
 *
 * Offered even though "always knows the password" argues against it: the case is a
 * laptop that has been reimaged, or a credential recorded against the wrong
 * asset, and keeping a password that no longer opens the device is worse than
 * keeping none. Clearing leaves an audit row, so the gap in the history is
 * visible.
 */
export async function clearDevicePassword(idOrAssetId: string): Promise<void> {
  const row = await findPasswordRow(idOrAssetId);

  if (!row.password) {
    throw ApiError.notFound(`No device password is stored for ${row.assetId}`);
  }

  await prisma.asset.update({
    where: { id: row.id },
    data: { password: null, passwordSetAt: null, passwordSetById: null },
  });

  await recordAudit({
    action: AUDIT_ACTIONS.ASSET_PASSWORD_CLEARED,
    entityType: "ASSET",
    entityId: row.id,
    summary: `Cleared device password for ${row.assetId} (${row.assetType.code})`,
    changes: { password: { from: true, to: null } },
    metadata: {
      assetId: row.assetId,
      assetType: row.assetType.code,
      setAt: row.passwordSetAt?.toISOString() ?? null,
      setBy: row.passwordSetBy?.name ?? null,
    },
  });
}