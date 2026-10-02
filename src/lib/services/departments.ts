import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS, diffFields } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError, fromPrismaError } from "@/lib/errors";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "@/lib/validators/department";

export interface DepartmentDto {
  id: string;
  name: string;
  /** How many accounts point at this department. Drives the delete guard. */
  staffCount: number;
}

const departmentSelect = {
  id: true,
  name: true,
  _count: { select: { staff: true } },
} as const;

type DepartmentRecord = {
  id: string;
  name: string;
  _count: { staff: number };
};

function toDto(department: DepartmentRecord): DepartmentDto {
  return {
    id: department.id,
    name: department.name,
    staffCount: department._count.staff,
  };
}

/** Every department, alphabetically, each with the number of accounts in it. */
export async function listDepartments(): Promise<DepartmentDto[]> {
  const departments = await prisma.department.findMany({
    select: departmentSelect,
    orderBy: { name: "asc" },
  });

  return departments.map(toDto);
}

/**
 * The pick list for the staff forms. Identical data to `listDepartments` — the
 * two exist so the intent at each call site is obvious, not to cache anything.
 */
export async function listDepartmentOptions(): Promise<DepartmentDto[]> {
  return listDepartments();
}

/**
 * Trim and collapse a name before it is compared or stored.
 *
 * Repeated here rather than trusted from the validator, because these services
 * are plain functions that a REST route, a script or a future caller can invoke
 * with a raw string. Normalising only at the form boundary would mean the string
 * that reached the duplicate check is not the string that reached the column,
 * which is how " IT " and "IT" end up as two departments.
 */
function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Reject a name that already exists, ignoring case.
 *
 * The `name @unique` constraint only catches an exact match, so "it" would
 * otherwise be inserted next to "IT" and the two would show up side by side in
 * every department picker — the exact problem this relation was introduced to
 * remove. Checked here rather than by lowering the stored value, because a
 * department's casing is a display choice ("IT" and "Design" both read
 * correctly) and rewriting what somebody typed would be its own surprise.
 */
async function assertNameAvailable(name: string, excludeId?: string): Promise<void> {
  const existing = await prisma.department.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { name: true },
  });

  if (existing) {
    throw ApiError.conflict(`A department named "${existing.name}" already exists`);
  }
}

export async function createDepartment(input: CreateDepartmentInput): Promise<DepartmentDto> {
  const name = normaliseName(input.name);
  await assertNameAvailable(name);

  try {
    const created = await prisma.department.create({
      data: { name },
      select: departmentSelect,
    });

    await recordAudit({
      action: AUDIT_ACTIONS.DEPARTMENT_CREATED,
      entityType: "DEPARTMENT",
      entityId: created.id,
      summary: `Created department ${created.name}`,
      metadata: { name: created.name },
    });

    return toDto(created);
  } catch (error) {
    throw fromPrismaError(error, "create department");
  }
}

/**
 * Rename a department.
 *
 * Only the label changes: the id is what staff rows point at, so nothing else in
 * the register has to be touched. That is the main reason this is a relation
 * rather than a string repeated on every account.
 */
export async function updateDepartment(
  id: string,
  input: UpdateDepartmentInput,
): Promise<DepartmentDto> {
  const existing = await prisma.department.findUnique({ where: { id }, select: departmentSelect });

  if (!existing) throw ApiError.notFound(`Department ${id} not found`);

  const name = normaliseName(input.name);

  // Only worth checking when the name is actually changing; saving a record
  // without touching its label should not fail because of an unrelated clash.
  if (existing.name.toLowerCase() !== name.toLowerCase()) {
    await assertNameAvailable(name, id);
  }

  try {
    const updated = await prisma.department.update({
      where: { id },
      data: { name },
      select: departmentSelect,
    });

    const changes = diffFields(existing, { name });
    if (Object.keys(changes).length > 0) {
      await recordAudit({
        action: AUDIT_ACTIONS.DEPARTMENT_RENAMED,
        entityType: "DEPARTMENT",
        entityId: updated.id,
        summary: `Renamed department ${existing.name} to ${updated.name}`,
        changes,
        metadata: { name: updated.name },
      });
    }

    return toDto(updated);
  } catch (error) {
    throw fromPrismaError(error, "update department");
  }
}

/**
 * Delete a department.
 *
 * Refused while any account points at it, and the message says how many, because
 * "cannot delete" on its own tells the operator nothing about what to do next.
 * The FK is `ON DELETE RESTRICT`, so the database agrees even if this check is
 * ever bypassed; the explicit count is there to turn a raw constraint violation
 * into an explanation.
 */
export async function deleteDepartment(id: string): Promise<void> {
  const existing = await prisma.department.findUnique({ where: { id }, select: departmentSelect });

  if (!existing) throw ApiError.notFound(`Department ${id} not found`);

  if (existing._count.staff > 0) {
    throw ApiError.conflict(
      `${existing.name} still has ${existing._count.staff} staff member(s). Move them to another department first.`,
    );
  }

  try {
    await prisma.department.delete({ where: { id } });

    await recordAudit({
      action: AUDIT_ACTIONS.DEPARTMENT_DELETED,
      entityType: "DEPARTMENT",
      entityId: id,
      summary: `Deleted department ${existing.name}`,
      metadata: { name: existing.name },
    });
  } catch (error) {
    throw fromPrismaError(error, "delete department");
  }
}