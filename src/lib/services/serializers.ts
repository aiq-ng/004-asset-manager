import type { Prisma, StaffRole } from "@/generated/prisma/client";

export const staffSelect = {
  id: true,
  name: true,
  department: { select: { id: true, name: true } },
  email: true,
  phone: true,
  role: true,
} satisfies Prisma.StaffSelect;

/** Relations loaded whenever an asset is returned to a client. */
export const assetInclude = {
  assetType: { select: { id: true, name: true, code: true } },
  // Provenance for the stored device password, so the register and the detail
  // page can say who set it without a second query per row. The name only —
  // never the ciphertext, which has no place in a DTO.
  passwordSetBy: { select: { name: true } },
  assignments: {
    where: { dateReturned: null },
    orderBy: { dateAssigned: "desc" },
    take: 1,
    include: {
      staff: { select: staffSelect },
      assignedBy: { select: staffSelect },
      returnedBy: { select: staffSelect },
    },
  },
} satisfies Prisma.AssetInclude;

/** Detail view variant: every assignment, newest first. */
export const assetWithHistoryInclude = {
  ...assetInclude,
  assignments: {
    orderBy: { dateAssigned: "desc" },
    include: {
      staff: { select: staffSelect },
      assignedBy: { select: staffSelect },
      returnedBy: { select: staffSelect },
    },
  },
} satisfies Prisma.AssetInclude;

export const assignmentInclude = {
  asset: { include: { assetType: { select: { id: true, name: true, code: true } } } },
  staff: { select: staffSelect },
  assignedBy: { select: staffSelect },
  returnedBy: { select: staffSelect },
} satisfies Prisma.AssignmentInclude;

export type AssetRecord = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;
export type AssetWithHistory = Prisma.AssetGetPayload<{
  include: typeof assetWithHistoryInclude;
}>;
export type AssignmentRecord = Prisma.AssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;
export type StaffRecord = Prisma.StaffGetPayload<{ select: typeof staffSelect }>;

type AssignmentRow = {
  id: string;
  dateAssigned: Date;
  dateReturned: Date | null;
  note: string | null;
  staff: StaffRecord;
  /** Null only for rows written before this was recorded. */
  assignedBy: StaffRecord | null;
  /** Condition description captured when the assignment was closed. */
  returnNote: string | null;
  /** Storage key of the photo taken as the asset came back. */
  returnImageKey: string | null;
  /** Who accepted the return; null for legacy rows and still-open assignments. */
  returnedBy: StaffRecord | null;
};

export interface StaffDto {
  id: string;
  name: string;
  /**
   * The department's name, flattened out of the relation.
   *
   * The DTO keeps presenting a plain string on purpose: it is the app's own
   * contract, and every read site — tables, the masthead, the dashboard badge —
   * wants to print a name, not traverse a relation. The flattening happens here,
   * once, instead of at two dozen call sites.
   */
  department: string;
  /** Needed by the staff forms to preselect the current value. */
  departmentId: string;
  email: string;
  phone: string | null;
  role: StaffRole;
}

export interface AssignmentDto {
  id: string;
  dateAssigned: string;
  dateReturned: string | null;
  note: string | null;
  staff: StaffDto;
  /** Who handed the asset over; null for legacy rows. */
  assignedBy: StaffDto | null;
  /** Condition description captured at return; null while still out or legacy. */
  returnNote: string | null;
  /** Storage key of the return photo; null while still out or legacy. */
  returnImageKey: string | null;
  /** Who accepted the return; null while still out or legacy. */
  returnedBy: StaffDto | null;
}

export interface AssetDto {
  id: string;
  assetId: string;
  description: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: string;
  imageKey: string | null;
  imageUrl: string | null;
  assetType: { id: string; name: string; code: string };
  assignedTo: StaffDto | null;
  assignment: AssignmentDto | null;
  /**
   * Whether a device password is stored, and where it came from — never the
   * password itself.
   *
   * `AssetRecord` selects the asset row whole, so the encrypted ciphertext rides
   * along with every list and detail read. It stops here: `AssetDto` carries only
   * the two metadata fields, and the value is reachable through exactly one
   * function in `services/asset-passwords.ts`. Do not add it to this interface to
   * save a round trip — see the note on `password` in the schema.
   *
   * Safe to show to any reader of an asset: it says a password exists, not what
   * it is.
   */
  devicePassword: { setAt: string; setBy: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDetailDto extends AssetDto {
  history: AssignmentDto[];
}

export function toStaffDto(staff: StaffRecord): StaffDto {
  return {
    id: staff.id,
    name: staff.name,
    department: staff.department.name,
    departmentId: staff.department.id,
    email: staff.email,
    phone: staff.phone,
    role: staff.role,
  };
}

function toAssignmentDto(row: AssignmentRow): AssignmentDto {
  return {
    id: row.id,
    dateAssigned: row.dateAssigned.toISOString(),
    dateReturned: row.dateReturned ? row.dateReturned.toISOString() : null,
    note: row.note,
    staff: toStaffDto(row.staff),
    assignedBy: row.assignedBy ? toStaffDto(row.assignedBy) : null,
    returnNote: row.returnNote,
    returnImageKey: row.returnImageKey,
    returnedBy: row.returnedBy ? toStaffDto(row.returnedBy) : null,
  };
}

type AssetRow = AssetRecord | AssetWithHistory;

function toAssetBase(asset: AssetRow, imageUrl: string | null): AssetDto {
  // The *open* assignment, which is not the same as the newest row.
  //
  // `assetInclude` filters to `dateReturned: null` at the database, but
  // `assetWithHistoryInclude` overrides that clause to return every assignment
  // for the timeline, so on the detail page this list still contains closed
  // ones. Taking `[0]` there handed back the most recent assignment whatever its
  // state, which left the detail panel showing a holder who had already returned
  // the asset, together with a Record return button for a row that was closed.
  // Finding the open one here keeps the two include variants interchangeable.
  const active = asset.assignments.find((row) => row.dateReturned === null) ?? null;

  return {
    id: asset.id,
    assetId: asset.assetId,
    description: asset.description,
    brand: asset.brand,
    model: asset.model,
    serialNumber: asset.serialNumber,
    status: asset.status,
    imageKey: asset.imageKey,
    imageUrl,
    assetType: asset.assetType,
    assignedTo: active ? toStaffDto(active.staff) : null,
    assignment: active ? toAssignmentDto(active) : null,
    // Presence and provenance only. `password` is on `asset` right now and is
    // deliberately not read: this is the boundary the whole credential design
    // rests on.
    devicePassword: asset.passwordSetAt
      ? { setAt: asset.passwordSetAt.toISOString(), setBy: asset.passwordSetBy?.name ?? null }
      : null,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function toAssetDto(asset: AssetRow, imageUrl: string | null): AssetDto {
  return toAssetBase(asset, imageUrl);
}

export function toAssetDetailDto(
  asset: AssetWithHistory,
  imageUrl: string | null,
): AssetDetailDto {
  return {
    ...toAssetBase(asset, imageUrl),
    history: asset.assignments.map(toAssignmentDto),
  };
}
