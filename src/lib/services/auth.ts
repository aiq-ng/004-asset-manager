import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError } from "@/lib/errors";
import { PASSWORD_RESET_TTL_MINUTES } from "@/lib/config";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

/**
 * Credentials live on the staff row: `email` identifies the account,
 * `passwordHash` is the scrypt digest (null until a password is set).
 */

export interface LoginResult {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
}

/**
 * Verifies credentials and issues the session cookie.
 *
 * A wrong email and a wrong password return the same message on purpose, so the
 * endpoint cannot be used to enumerate accounts.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const staff = await prisma.staff.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      department: { select: { name: true } },
      role: true,
      passwordHash: true,
      sessionVersion: true,
      mustChangePassword: true,
    },
  });

  const invalid = ApiError.unauthenticated("Invalid email or password");

  // Failed sign-ins are the most security-relevant event in the whole trail, so
  // they are recorded too. The address that failed to authenticate is part of
  // the event rather than a session, because no session exists yet.
  if (!staff?.passwordHash) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "SESSION",
      summary: `Failed sign-in for ${email}`,
      metadata: {
        attemptedEmail: email,
        reason: staff ? "account has no password set" : "unknown account",
      },
      actor: null,
    });

    // No account, or an account that has never had a password set.
    throw invalid;
  }

  if (!(await verifyPassword(password, staff.passwordHash))) {
    await recordAudit({
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "SESSION",
      entityId: staff.id,
      summary: `Failed sign-in for ${staff.email}`,
      metadata: { attemptedEmail: staff.email, reason: "wrong password" },
      actor: null,
    });

    throw invalid;
  }

  if (needsRehash(staff.passwordHash)) {
    const upgraded = await hashPassword(password);
    await prisma.staff.update({ where: { id: staff.id }, data: { passwordHash: upgraded } });
  }

  await createSession(staff.id, staff.sessionVersion);

  await recordAudit({
    action: AUDIT_ACTIONS.LOGIN_SUCCEEDED,
    entityType: "SESSION",
    entityId: staff.id,
    summary: `${staff.email} signed in`,
    metadata: { email: staff.email, role: staff.role, passwordRehashed: needsRehash(staff.passwordHash) },
    actor: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      department: staff.department.name,
      role: staff.role,
      mustChangePassword: staff.mustChangePassword,
    },
  });

  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    department: staff.department.name,
    role: staff.role,
  };
}

/**
 * Signs the account out everywhere: bumping `sessionVersion` invalidates every
 * cookie already issued, which deleting the cookie alone cannot do (a stateless
 * token stays valid until it expires).
 */
export async function logout(staffId: string, actorEmail?: string): Promise<void> {
  await prisma.staff.update({
    where: { id: staffId },
    data: { sessionVersion: { increment: 1 } },
  });
  await destroySession();

  await recordAudit({
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: "SESSION",
    entityId: staffId,
    summary: `${actorEmail ?? "A user"} signed out (all sessions revoked)`,
    metadata: { sessionsRevoked: true },
  });
}

/** Self-service password change: the actor proves they know the current one. */
export async function changePassword(
  staffId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { passwordHash: true, sessionVersion: true },
  });

  if (!staff) throw ApiError.notFound(`Staff ${staffId} not found`);

  // An account that has never had a password may set one without proving
  // anything, but only someone who already signed in can reach this endpoint,
  // and their account was verified against a password at login.
  if (staff.passwordHash && !(await verifyPassword(currentPassword, staff.passwordHash))) {
    throw ApiError.unauthenticated("Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);

  // A password change revokes other sessions, then re-issues this one so the
  // person who just changed it stays signed in. It also ends any "temporary
  // password" state: the caller just proved they know the current one.
  await prisma.staff.update({
    where: { id: staffId },
    data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
  });

  await createSession(staffId, staff.sessionVersion + 1);

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: "SESSION",
    entityId: staffId,
    summary: `${staffId} changed their own password (other sessions revoked)`,
    metadata: { selfService: true, sessionsRevoked: true },
  });
}

export async function hasPassword(staffId: string): Promise<boolean> {
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { passwordHash: true },
  });

  return Boolean(staff?.passwordHash);
}

/**
 * The "forgot password" flow.
 *
 * Only the SHA-256 digest of the token is stored, so the rows in the database
 * cannot be replayed against the reset endpoint; the raw token exists only in
 * the email. A new request deletes the account's previous tokens, so exactly
 * one live link per account at a time and expired rows never pile up.
 */
const RESET_TOKEN_BYTES = 32;

function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Emails a single-use reset link if — and only if — the account exists. The
 * caller answers with the same success message either way, so the endpoint
 * cannot be used to find out who has an account.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const staff = await prisma.staff.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!staff) return;

  // Supersedes any earlier link and sweeps expired/consumed rows for this
  // account in one go.
  await prisma.passwordResetToken.deleteMany({ where: { staffId: staff.id } });

  const rawToken = randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  await prisma.passwordResetToken.create({
    data: {
      staffId: staff.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    },
  });

  const result = await sendPasswordResetEmail({
    to: staff.email,
    name: staff.name,
    rawToken,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
    entityType: "SESSION",
    entityId: staff.id,
    summary: result.delivered
      ? `Password reset link emailed to ${staff.email}`
      : result.skipped
        ? `Password reset email to ${staff.email} skipped (no mail key configured)`
        : `Password reset email to ${staff.email} failed: ${result.error}`,
    metadata: {
      email: staff.email,
      delivered: result.delivered,
      skipped: result.skipped,
      expiresAfterMinutes: PASSWORD_RESET_TTL_MINUTES,
    },
    actor: null,
  });
}

/**
 * Consumes a reset token and sets the new password.
 *
 * Invalid, used and expired tokens all return the same message — which one the
 * caller holds is nobody's business but the mailbox owner's. The password set
 * bumps `sessionVersion`, so any session the account still holds is revoked.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(rawToken) },
    include: { staff: { select: { id: true, email: true } } },
  });

  const invalid = ApiError.badRequest(
    "This reset link is invalid or has expired. Request a new one.",
  );
  if (!record || record.usedAt !== null || record.expiresAt <= new Date()) throw invalid;

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.staff.update({
      where: { id: record.staffId },
      // The token proved mailbox ownership, so the forced-change flag lifts too.
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  await recordAudit({
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    entityType: "SESSION",
    entityId: record.staffId,
    summary: `${record.staff.email} set a new password from a reset link (sessions revoked)`,
    metadata: { viaResetLink: true, sessionsRevoked: true },
    actor: null,
  });
}