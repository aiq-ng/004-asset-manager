import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError } from "@/lib/errors";
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
      department: true,
      role: true,
      passwordHash: true,
      sessionVersion: true,
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
      department: staff.department,
      role: staff.role,
    },
  });

  return {
    id: staff.id,
    name: staff.name,
    email: staff.email,
    department: staff.department,
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
  // person who just changed it stays signed in.
  await prisma.staff.update({
    where: { id: staffId },
    data: { passwordHash, sessionVersion: { increment: 1 } },
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