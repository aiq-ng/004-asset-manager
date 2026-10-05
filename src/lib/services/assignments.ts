import { prisma } from "@/lib/prisma";
import { AUDIT_ACTIONS } from "@/lib/audit/events";
import { recordAudit } from "@/lib/audit/context";
import { ApiError, fromPrismaError } from "@/lib/errors";
import { buildAssignmentObjectKey, getStorage } from "@/lib/storage";
import { requireAssignableTarget, type Actor } from "@/lib/auth/permissions";
import type { ParsedImage } from "@/lib/services/images";
import {
  assignmentInclude,
  toStaffDto,
  type AssignmentRecord,
} from "@/lib/services/serializers";
import type {
  CreateAssignmentInput,
  ListAssignmentsQuery,
  ReturnAssignmentInput,
} from "@/lib/validators/assignment";

export interface AssignmentDto {
  id: string;
  assetId: string;
  dateAssigned: string;
  dateReturned: string | null;
  note: string | null;
  active: boolean;
  asset: {
    id: string;
    assetId: string;
    description: string;
    status: string;
  };
  staff: {
    id: string;
    name: string;
    department: string;
    email: string;
    phone: string | null;
  };
  /** Who handed the asset over; null for rows written before this was recorded. */
  assignedBy: {
    id: string;
    name: string;
    department: string;
  } | null;
  /** Condition description captured at return; null while still out or legacy. */
  returnNote: string | null;
  /** Storage key of the return photo; null while still out or legacy. */
  returnImageKey: string | null;
  /** The privileged actor who accepted the return; null while still out or legacy. */
  returnedBy: {
    id: string;
    name: string;
    department: string;
  } | null;
}

function toDto(row: AssignmentRecord): AssignmentDto {
  return {
    id: row.id,
    assetId: row.asset.id,
    dateAssigned: row.dateAssigned.toISOString(),
    dateReturned: row.dateReturned ? row.dateReturned.toISOString() : null,
    note: row.note,
    active: row.dateReturned === null,
    asset: {
      id: row.asset.id,
      assetId: row.asset.assetId,
      description: row.asset.description,
      status: row.asset.status,
    },
    staff: toStaffDto(row.staff),
    assignedBy: row.assignedBy
      ? {
          id: row.assignedBy.id,
          name: row.assignedBy.name,
          department: row.assignedBy.department.name,
        }
      : null,
    returnNote: row.returnNote,
    returnImageKey: row.returnImageKey,
    returnedBy: row.returnedBy
      ? {
          id: row.returnedBy.id,
          name: row.returnedBy.name,
          department: row.returnedBy.department.name,
        }
      : null,
  };
}

function toAssetWhere(idOrAssetId: string): { id: string } | { assetId: string } {
  return idOrAssetId.startsWith("IT-") ? { assetId: idOrAssetId } : { id: idOrAssetId };
}

/**
 * Hands an asset to a staff member.
 *
 * Rules, all enforced inside one transaction:
 *  - the asset must exist and be AVAILABLE (422 otherwise)
 *  - the staff member must exist (422)
 *  - the actor must be allowed to hand assets to that person (403): an ASSIGNER
 *    may target users and other assigners but never themselves
 *  - an asset can have at most one active assignment: the partial unique index
 *    `Assignment_one_active_per_asset` turns a race into a P2002 -> 409
 *  - the asset status flips to ASSIGNED
 */
export async function createAssignment(
  input: CreateAssignmentInput,
  actor: Actor,
): Promise<AssignmentDto> {
  const asset = await prisma.asset.findUnique({ where: toAssetWhere(input.assetId) });
  if (!asset) throw ApiError.notFound(`Asset ${input.assetId} not found`);

  const staff = await prisma.staff.findUnique({
    where: { id: input.staffId },
    select: { id: true, role: true },
  });
  if (!staff) throw ApiError.notFound(`Staff ${input.staffId} not found`);

  // Role check: assigners cannot hand assets to themselves or to admins.
  requireAssignableTarget(actor, staff);

  if (asset.status !== "AVAILABLE") {
    throw ApiError.unprocessable(
      `Only AVAILABLE assets can be assigned (asset is ${asset.status})`,
    );
  }

  const active = await prisma.assignment.findFirst({
    where: { assetId: asset.id, dateReturned: null },
    select: { id: true },
  });
  if (active) {
    throw ApiError.conflict("Asset already has an active assignment");
  }

  try {
    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.assignment.create({
        data: {
          assetId: asset.id,
          staffId: staff.id,
          note: input.note ?? null,
          // The assigner is the authenticated actor, taken from the session —
          // never from the request body.
          assignedById: actor.id,
        },
      });

      // Guard against a concurrent assignment that slipped in between the check
      // above and this write: refuse to flip an asset that already has one.
      const claimed = await tx.asset.updateMany({
        where: { id: asset.id, status: "AVAILABLE" },
        data: { status: "ASSIGNED" },
      });

      if (claimed.count === 0) {
        throw ApiError.unprocessable("Asset is no longer available");
      }

      return tx.assignment.findUniqueOrThrow({
        where: { id: created.id },
        include: assignmentInclude,
      });
    });

    await recordAudit({
      action: AUDIT_ACTIONS.ASSIGNMENT_CREATED,
      entityType: "ASSIGNMENT",
      entityId: assignment.id,
      summary: `${actor.email} assigned ${asset.assetId} to ${staff.id}`,
      metadata: {
        assetId: asset.assetId,
        assetDbId: asset.id,
        staffId: staff.id,
        staffRole: staff.role,
        assignedById: actor.id,
        note: assignment.note,
      },
    });

    return toDto(assignment);
  } catch (error) {
    throw fromPrismaError(error, "create assignment");
  }
}

/**
 * Closes an assignment and puts the asset back into the pool. History is kept.
 *
 * The closing actor is the session's own identity, stored as `returnedById` —
 * the "return accepted by" record the UI shows on the history timeline. The
 * condition note and the return photo (an identification record of how the asset
 * came back, in the same bucket as asset photos) are optional: a return can be
 * recorded without either, and the row must never be un-writable because an
 * optional detail was missing.
 *
 * The photo is uploaded before the transaction, mirroring `replaceAssetImage`:
 * if the database write fails, the fresh object is removed again so no orphan is
 * left behind in the bucket.
 */
export async function returnAssignment(
  id: string,
  /** Validated note plus the already-parsed image; the REST route passes no image. */
  input: ReturnAssignmentInput & { image?: ParsedImage },
  actor: Actor,
): Promise<AssignmentDto> {
  const assignment = await prisma.assignment.findUnique({ where: { id } });
  if (!assignment) throw ApiError.notFound(`Assignment ${id} not found`);

  if (assignment.dateReturned !== null) {
    throw ApiError.unprocessable("Assignment has already been returned");
  }

  let imageKey: string | null = null;
  if (input.image) {
    const storage = getStorage();
    imageKey = buildAssignmentObjectKey(id, input.image.extension);
    await storage.uploadObject({
      key: imageKey,
      body: input.image.buffer,
      contentType: input.image.contentType,
    });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const returned = await tx.assignment.update({
        where: { id },
        data: {
          dateReturned: new Date(),
          returnNote: input.returnNote ?? null,
          returnImageKey: imageKey,
          // The accepter is the authenticated actor, taken from the session —
          // never from the request body.
          returnedById: actor.id,
        },
      });

      await tx.asset.update({
        where: { id: assignment.assetId },
        data: { status: "AVAILABLE" },
      });

      return tx.assignment.findUniqueOrThrow({
        where: { id: returned.id },
        include: assignmentInclude,
      });
    });

    const returnedAt = updated.dateReturned ?? new Date();

    await recordAudit({
      action: AUDIT_ACTIONS.ASSIGNMENT_RETURNED,
      entityType: "ASSIGNMENT",
      entityId: updated.id,
      summary: `Returned ${updated.asset.assetId} from ${updated.staff.email}`,
      changes: {
        dateReturned: { from: null, to: returnedAt.toISOString() },
      },
      metadata: {
        assetId: updated.asset.assetId,
        staffId: updated.staff.id,
        returnedById: actor.id,
        returnNote: updated.returnNote,
        returnImageKey: updated.returnImageKey,
        heldForDays: Math.max(
          0,
          Math.round(
            (returnedAt.getTime() - new Date(updated.dateAssigned).getTime()) / 86_400_000,
          ),
        ),
      },
    });

    return toDto(updated);
  } catch (error) {
    if (imageKey) {
      await getStorage()
        .deleteObject(imageKey)
        .catch((storageError: unknown) => {
          console.error("[storage] failed to delete return photo after failed write", imageKey, storageError);
        });
    }
    throw fromPrismaError(error, "return assignment");
  }
}

export async function listAssignments(
  query: ListAssignmentsQuery,
): Promise<{ items: AssignmentDto[]; total: number; page: number; pageSize: number }> {
  const where = {
    // `q` spans the joined asset and staff rows, so a search finds either the
    // asset id or the person holding it.
    ...(query.q
      ? {
          OR: [
            { asset: { assetId: { contains: query.q, mode: "insensitive" as const } } },
            { asset: { description: { contains: query.q, mode: "insensitive" as const } } },
            { staff: { name: { contains: query.q, mode: "insensitive" as const } } },
            { staff: { email: { contains: query.q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(query.assetId
      ? { asset: toAssetWhere(query.assetId) }
      : {}),
    ...(query.staffId ? { staffId: query.staffId } : {}),
    ...(query.active !== undefined ? { dateReturned: query.active ? null : { not: null } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: assignmentInclude,
      orderBy: { dateAssigned: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.assignment.count({ where }),
  ]);

  return {
    items: rows.map(toDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}