import { Prisma, StaffRole } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, diffFields } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { generateTemporaryPassword, hashPassword } from "@/lib/auth/password";
import { sendInviteEmail } from "@/lib/email/resend";
import { staffSelect, toStaffDto, type StaffDto } from "@/lib/services/serializers";
import type { CreateStaffInput, ListStaffQuery, UpdateStaffInput } from "@/lib/validators/staff";
import type { Actor } from "@/lib/auth/permissions";

export interface CurrentAssetDto {
  id: string;
  assetId: string;
  description: string;
  status: string;
}

/**
 * One entry of a staff member's assignment history. `asset.status` is the
 * asset's *current* status, not the status it had while it was held.
 */
export interface StaffHistoryEntryDto {
  id: string;
  assetId: string;
  dateAssigned: string;
  dateReturned: string | null;
  note: string | null;
  active: boolean;
  asset: CurrentAssetDto & { assetType: { id: string; name: string; code: string } };
}

export interface StaffDetailDto extends StaffDto {
  createdAt: string;
  updatedAt: string;
  currentAssets: CurrentAssetDto[];
  /** Every assignment ever held, newest first. Rows are never deleted. */
  history: StaffHistoryEntryDto[];
}

function toDetail(staff: StaffDetailRecord): StaffDetailDto {
  const toCurrentAsset = ({ asset }: StaffDetailRecord["assignments"][number]): CurrentAssetDto => ({
    id: asset.id,
    assetId: asset.assetId,
    description: asset.description,
    status: asset.status,
  });

  return {
    ...toStaffDto(staff),
    createdAt: staff.createdAt.toISOString(),
    updatedAt: staff.updatedAt.toISOString(),
    currentAssets: staff.assignments
      .filter((assignment) => assignment.dateReturned === null)
      .map(toCurrentAsset),
    history: staff.assignments.map((assignment) => ({
      id: assignment.id,
      assetId: assignment.asset.id,
      dateAssigned: assignment.dateAssigned.toISOString(),
      dateReturned: assignment.dateReturned ? assignment.dateReturned.toISOString() : null,
      note: assignment.note,
      active: assignment.dateReturned === null,
      asset: { ...toCurrentAsset(assignment), assetType: assignment.asset.assetType },
    })),
  };
}

/** Detail view: scalars, the assets currently held, and the full history. */
const staffDetailSelect = {
  ...staffSelect,
  createdAt: true,
  updatedAt: true,
  assignments: {
    orderBy: { dateAssigned: "desc" },
    select: {
      id: true,
      dateAssigned: true,
      dateReturned: true,
      note: true,
      asset: {
        select: {
          id: true,
          assetId: true,
          description: true,
          status: true,
          assetType: { select: { id: true, name: true, code: true } },
        },
      },
    },
  },
} satisfies Prisma.StaffSelect;

type StaffDetailRecord = Prisma.StaffGetPayload<{ select: typeof staffDetailSelect }>;

export async function listStaff(
  query: ListStaffQuery,
): Promise<{ items: StaffDto[]; total: number; page: number; pageSize: number }> {
  const where = {
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { email: { contains: query.q, mode: "insensitive" as const } },
            { department: { name: { contains: query.q, mode: "insensitive" as const } } },
            { phone: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    // The filter is a department id, not a name: the picker offers exactly the
    // departments that exist, so matching on the id is both cheaper and immune to
    // two departments ever being spelled the same way.
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.role ? { role: query.role } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      select: staffSelect,
      orderBy: { name: "asc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.staff.count({ where }),
  ]);

  return { items: rows.map(toStaffDto), total, page: query.page, pageSize: query.pageSize };
}

/** One member of staff as a picker's option: enough to list and to search. */
export interface StaffOptionDto {
  id: string;
  name: string;
  /** The department's name, flattened out of the relation as `StaffDto` does. */
  department: string;
  /** Searched by the pickers as well as listed, so people can be found by it. */
  email: string;
  role: StaffRole;
}

/**
 * Every member of staff, for the controls that offer them as options.
 *
 * Deliberately not `listStaff`. That one backs the paginated register at
 * `/staff`, where a page of rows is the whole point and `pageSize` is capped by
 * `PAGINATION_MAX_PAGE_SIZE`. A picker has no pages: it has a search box and a
 * virtualised list, so a cap buys nothing and costs reachability — at a hundred
 * staff the cap stopped mattering, and past it everyone alphabetically after the
 * hundredth was silently unassignable and unfilterable, with nothing on screen
 * to say so.
 *
 * The honest limit: this ships the whole company to the browser, which is the
 * right trade in the thousands and the wrong one in the tens of thousands. At
 * that size the picker has to ask the server as you type instead, and this
 * function is the seam where that query would go.
 */
export async function listStaffOptions(): Promise<StaffOptionDto[]> {
  const rows = await prisma.staff.findMany({
    select: {
      id: true,
      name: true,
      department: { select: { name: true } },
      email: true,
      role: true,
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    department: row.department.name,
    email: row.email,
    role: row.role,
  }));
}

export async function getStaff(id: string): Promise<StaffDetailDto> {
  const staff = await prisma.staff.findUnique({ where: { id }, select: staffDetailSelect });

  if (!staff) throw ApiError.notFound(`Staff ${id} not found`);

  return toDetail(staff);
}

export async function createStaff(input: CreateStaffInput): Promise<StaffDto> {
  // No explicit password means an invite: the account gets a generated temporary
  // password that is shown once, in the email — never in the API response.
  const temporaryPassword = input.password ? null : generateTemporaryPassword();

  try {
    const created = await prisma.staff.create({
      data: {
        name: input.name,
        departmentId: input.departmentId,
        email: input.email,
        phone: input.phone ?? null,
        role: input.role as StaffRole,
        passwordHash:
          input.password !== undefined
            ? await hashPassword(input.password)
            : await hashPassword(temporaryPassword!),
        invitedAt: temporaryPassword ? new Date() : null,
        // The invitee signs in with a password only they cannot know is safe —
        // it went through email — so they must replace it before doing anything.
        mustChangePassword: temporaryPassword !== null,
      },
      select: staffSelect,
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STAFF_CREATED,
      entityType: "STAFF",
      entityId: created.id,
      summary: `Created staff account ${created.email} as ${created.role}`,
      metadata: {
        email: created.email,
        role: created.role,
        department: created.department.name,
        // Deliberately records that a password was set, never the password.
        passwordSet: input.password !== undefined,
        invitedByEmail: temporaryPassword !== null,
      },
    });

    if (temporaryPassword) {
      const result = await sendInviteEmail({
        to: created.email,
        name: created.name,
        temporaryPassword,
      });

      await recordAudit({
        action: AUDIT_ACTIONS.STAFF_INVITED,
        entityType: "STAFF",
        entityId: created.id,
        summary: result.delivered
          ? `Sent invite email to ${created.email}`
          : result.skipped
            ? `Invite email to ${created.email} skipped (no mail key configured)`
            : `Invite email to ${created.email} failed: ${result.error}`,
        metadata: {
          email: created.email,
          delivered: result.delivered,
          skipped: result.skipped,
        },
      });
    }

    return toStaffDto(created);
  } catch (error) {
    throw fromPrismaError(error, "create staff");
  }
}

/**
 * Re-issues an invite: a new temporary password is generated (invalidating the
 * old one and any sessions), then emailed. The recovery path when the first
 * invite never arrived, or the recipient lost it before signing in.
 */
export async function resendStaffInvite(id: string, actor: Actor): Promise<{ delivered: boolean; skipped: boolean }> {
  const target = await prisma.staff.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!target) throw ApiError.notFound(`Staff ${id} not found`);
  if (target.role === "SUPERADMIN") {
    throw ApiError.forbidden("The superadmin account cannot be modified");
  }

  const temporaryPassword = generateTemporaryPassword();

  try {
    await prisma.staff.update({
      where: { id: target.id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        invitedAt: new Date(),
        // A fresh temporary password re-arms the forced change on next sign-in.
        mustChangePassword: true,
        // The old password is dead; any cookie that was signed in with it goes too.
        sessionVersion: { increment: 1 },
      },
    });

    const result = await sendInviteEmail({
      to: target.email,
      name: target.name,
      temporaryPassword,
    });

    await recordAudit({
      action: AUDIT_ACTIONS.STAFF_INVITED,
      entityType: "STAFF",
      entityId: target.id,
      summary: result.delivered
        ? `${actor.email} re-sent the invite email to ${target.email}`
        : result.skipped
          ? `Invite email to ${target.email} skipped (no mail key configured)`
          : `Invite email to ${target.email} failed: ${result.error}`,
      metadata: {
        email: target.email,
        delivered: result.delivered,
        skipped: result.skipped,
        resent: true,
        sessionsRevoked: true,
      },
    });

    return { delivered: result.delivered, skipped: result.skipped };
  } catch (error) {
    throw fromPrismaError(error, "resend staff invite");
  }
}

export async function updateStaff(id: string, input: UpdateStaffInput): Promise<StaffDto> {
  const target = await prisma.staff.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
      phone: true,
      department: { select: { id: true, name: true } },
    },
  });

  if (!target) throw ApiError.notFound(`Staff ${id} not found`);
  if (target.role === "SUPERADMIN") {
    throw ApiError.forbidden("The superadmin account cannot be modified");
  }

  try {
    const updated = await prisma.staff.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.role !== undefined ? { role: input.role as StaffRole } : {}),
        ...(input.password !== undefined
          ? {
              passwordHash: await hashPassword(input.password),
              // An admin-set password is a real password, not a temporary one.
              mustChangePassword: false,
              // A reset invalidates the cookies that account already holds.
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
      select: staffSelect,
    });

    // The password is reported separately: it never enters the diff, only the
    // fact that it was reset.
    const changes = diffFields(target, input as Partial<typeof target>);

    if (Object.keys(changes).length > 0) {
      await recordAudit({
        action: AUDIT_ACTIONS.STAFF_UPDATED,
        entityType: "STAFF",
        entityId: updated.id,
        summary: `Updated staff account ${updated.email} (${Object.keys(changes).join(", ")})`,
        changes,
        metadata: { email: updated.email },
      });
    }

    // A privilege change gets its own row: it is the entry an investigator
    // looks for, and it must survive even if it is the only change in a request.
    if (input.role !== undefined && input.role !== target.role) {
      await recordAudit({
        action: AUDIT_ACTIONS.STAFF_ROLE_CHANGED,
        entityType: "STAFF",
        entityId: updated.id,
        summary: `Changed role of ${updated.email} from ${target.role} to ${updated.role}`,
        changes: { role: { from: target.role, to: updated.role } },
        metadata: { email: updated.email },
      });
    }

    if (input.password !== undefined) {
      await recordAudit({
        action: AUDIT_ACTIONS.STAFF_PASSWORD_RESET,
        entityType: "STAFF",
        entityId: updated.id,
        summary: `Reset the password of ${updated.email} (existing sessions revoked)`,
        metadata: { email: updated.email, sessionsRevoked: true },
      });
    }

    return toStaffDto(updated);
  } catch (error) {
    throw fromPrismaError(error, "update staff");
  }
}

/**
 * Assignment history is preserved, so a staff member can only be deleted while
 * they have no assignments at all: currently holding assets is rejected up
 * front, and past assignments are protected by the `Assignment_staffId_fkey`
 * foreign key.
 */
export async function deleteStaff(id: string): Promise<void> {
  const staff = await prisma.staff.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      assignments: {
        select: { id: true, dateReturned: true },
      },
    },
  });

  if (!staff) throw ApiError.notFound(`Staff ${id} not found`);

  if (staff.role === "SUPERADMIN") {
    throw ApiError.forbidden("The superadmin account cannot be deleted");
  }

  if (staff.assignments.some((assignment) => assignment.dateReturned === null)) {
    throw ApiError.conflict(
      "Staff member still holds assigned assets; return them before deleting",
    );
  }

  try {
    await prisma.staff.delete({ where: { id } });

    await recordAudit({
      action: AUDIT_ACTIONS.STAFF_DELETED,
      entityType: "STAFF",
      entityId: id,
      summary: `Deleted staff account ${staff.email} (${staff.role})`,
      metadata: {
        email: staff.email,
        role: staff.role,
        department: staff.department.name,
        assignmentCount: staff.assignments.length,
      },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2003") {
      throw ApiError.conflict(
        "Staff member appears in assignment history; history is never deleted",
      );
    }
    throw fromPrismaError(error, "delete staff");
  }
}