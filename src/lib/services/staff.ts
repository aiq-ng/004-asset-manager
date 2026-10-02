import type { Prisma, StaffRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, diffFields } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";
import { staffSelect, toStaffDto, type StaffDto } from "@/lib/services/serializers";
import type { CreateStaffInput, ListStaffQuery, UpdateStaffInput } from "@/lib/validators/staff";

export interface CurrentAssetDto {
  id: string;
  assetId: string;
  description: string;
  status: string;
  unit: number;
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
    unit: asset.unit,
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
          unit: true,
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

export async function getStaff(id: string): Promise<StaffDetailDto> {
  const staff = await prisma.staff.findUnique({ where: { id }, select: staffDetailSelect });

  if (!staff) throw ApiError.notFound(`Staff ${id} not found`);

  return toDetail(staff);
}

export async function createStaff(input: CreateStaffInput): Promise<StaffDto> {
  try {
    const created = await prisma.staff.create({
      data: {
        name: input.name,
        departmentId: input.departmentId,
        email: input.email,
        phone: input.phone ?? null,
        role: input.role as StaffRole,
        // No password means a locked account: it exists but cannot sign in.
        passwordHash: input.password ? await hashPassword(input.password) : null,
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
      },
    });

    return toStaffDto(created);
  } catch (error) {
    throw fromPrismaError(error, "create staff");
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