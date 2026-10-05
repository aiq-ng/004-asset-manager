/**
 * Bootstrapping the one and only SUPERADMIN.
 *
 * Deliberately its own module rather than part of `services/staff.ts`, and
 * deliberately **not** marked `server-only`, for the same reason
 * `lib/audit/events.ts` is not: the `pnpm auth:create-superadmin` CLI runs under
 * plain `tsx`, where `server-only` throws on import. `services/staff.ts` pulls
 * in the audit context and the email sender, both of which are server-only, so
 * keeping the bootstrap beside them meant the CLI could not reuse the very
 * service it exists to call — it had to either duplicate the rules or fail at
 * import time with a message about a Client Component.
 *
 * Nothing here may import `server-only`, `node:*`-heavy modules, or anything
 * that needs a request. `lib/prisma` is safe to import because it resolves its
 * client on first use rather than at module load.
 */
import { PrismaClient, StaffRole } from "@/generated/prisma/client";
import { connection } from "next/server";
import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/events";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { staffSelect, toStaffDto, type StaffDto } from "@/lib/services/serializers";
// Type-only, so it is erased at runtime and the `server-only` guard in
// `lib/audit/context` is never evaluated.
import type { AuditEventInput } from "@/lib/audit/context";

/**
 * Whether the install has been bootstrapped yet.
 *
 * The app cannot be signed into at all without this account, so this single
 * boolean is what separates "fresh install" from "working install". It is
 * `cache()`d for the same reason `getActor` is: the setup page, the layout
 * guard and the action all ask within one request, and this must not drift
 * between them mid-render.
 *
 * `cache()` is a no-op outside React's request scope, which is exactly right:
 * the CLI should re-read rather than serve a stale answer.
 *
 * `connection()` first, and it is load-bearing rather than belt-and-braces.
 * `/setup` and `/forgot-password` have no Request-time APIs of their own, so
 * Next prerendered them at build time — and a prerendered `redirect()` is baked
 * into the HTML, not re-evaluated per request. Building an image while the
 * install *had* a superadmin shipped a `/setup` that redirected to `/login`
 * forever, against a database that had since lost one. Any page whose output
 * depends on whether the install is bootstrapped has to opt out of prerendering,
 * and doing it here rather than in each of the four call sites means a fifth
 * caller cannot forget.
 */
export const superadminExists = cache(async (): Promise<boolean> => {
  await connection();

  const found = await prisma.staff.findFirst({
    where: { role: StaffRole.SUPERADMIN },
    select: { id: true },
  });
  return found !== null;
});

export interface BootstrapSuperadminOptions {
  /**
   * The client to write through, for callers that brought their own.
   *
   * The CLI scripts build a `PrismaClient` from `DATABASE_URL` alone — the
   * pattern `prisma/seed.ts` sets — because the app's singleton reaches
   * `APP_URL`, `MINIO_*` and `SESSION_SECRET`. Requiring a storage bucket and a
   * session secret just to create an account would make this unusable on
   * exactly the machine it exists for: a container being provisioned before any
   * of that is configured.
   */
  client?: PrismaClient;
  /**
   * Where the audit row goes. Injected rather than imported because
   * `recordAudit` lives behind `server-only` and needs a request context.
   *
   * The setup screen passes the real recorder. A CLI run has no request to
   * attribute, and its publisher would be the no-op default anyway, so it
   * passes nothing — the bootstrap is still fully audited whenever it happens
   * through the app, which is the path with an operator attached to it.
   */
  record?: (event: AuditEventInput) => Promise<void>;
}

/**
 * Creates the one and only SUPERADMIN, from the app's setup screen or the CLI.
 *
 * Two properties are load-bearing and both are why this is not `createStaff`
 * with a role override:
 *
 * It never touches an existing account. An earlier version of the CLI promoted
 * the oldest staff row instead, which silently elevated somebody and overwrote
 * their password — running the bootstrap against a populated database was
 * account takeover of whoever happened to be created first. This only ever
 * inserts.
 *
 * The partial unique index `Staff_one_superadmin` is what actually enforces
 * "only one". The check below is the fast, friendly path — it produces a sentence
 * rather than a constraint violation — and the index is the one that cannot be
 * raced. Two browser tabs on a fresh install both pass this check, and only one
 * of them should win.
 *
 * The department is created rather than assumed. A genuinely empty database has
 * no departments, and `Staff.departmentId` is required; inventing an "Unassigned"
 * bucket instead would let a real department be misspelled later and never be
 * noticed, because the bucket would always be there to fall back into.
 */
export async function bootstrapSuperadmin(
  input: { name: string; email: string; password: string },
  { client = prisma, record }: BootstrapSuperadminOptions = {},
): Promise<StaffDto> {
  const existing = await client.staff.findFirst({
    where: { role: StaffRole.SUPERADMIN },
    select: { id: true },
  });

  if (existing) {
    throw ApiError.conflict("A superadmin already exists; this install is already set up.");
  }

  try {
    const created = await client.$transaction(async (tx) => {
      const department = await tx.department.upsert({
        where: { name: "IT" },
        update: {},
        create: { name: "IT" },
      });

      return tx.staff.create({
        data: {
          name: input.name,
          email: input.email,
          departmentId: department.id,
          role: StaffRole.SUPERADMIN,
          passwordHash: await hashPassword(input.password),
          // The operator is choosing this password on the account they are
          // creating, so there is no invite state to clear out of.
          invitedAt: null,
          mustChangePassword: false,
        },
        select: staffSelect,
      });
    });

    await record?.({
      action: AUDIT_ACTIONS.STAFF_CREATED,
      entityType: "STAFF",
      entityId: created.id,
      summary: `Bootstrapped the install with ${created.email} as SUPERADMIN`,
      metadata: {
        email: created.email,
        role: created.role,
        department: created.department.name,
        passwordSet: true,
        via: "setup-screen",
      },
    });

    return toStaffDto(created);
  } catch (error) {
    // The index fired: another request beat this one. Its wording matters more
    // than a raw P2002, because the person hitting it has just submitted the
    // setup form on a database that was, moments ago, empty.
    if ((error as { code?: string })?.code === "P2002") {
      const index = (error as { meta?: { driverAdapterError?: { cause?: { constraint?: { index?: string } | string } } } })
        .meta?.driverAdapterError?.cause?.constraint;
      const name = typeof index === "string" ? index : index?.index;

      if (name === "Staff_one_superadmin") {
        throw ApiError.conflict("This install already has a superadmin.");
      }

      throw ApiError.conflict("That email address already belongs to a staff account.");
    }

    throw fromPrismaError(error, "bootstrap superadmin");
  }
}