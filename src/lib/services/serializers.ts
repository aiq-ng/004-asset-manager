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
  unit: number;
  serialNumber: string | null;
  status: string;
  imageKey: string | null;
  imageUrl: string | null;
  assetType: { id: string; name: string; code: string };
  assignedTo: StaffDto | null;
  assignment: AssignmentDto | null;
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
  const active = asset.assignments[0] ?? null;

  return {
    id: asset.id,
    assetId: asset.assetId,
    description: asset.description,
    brand: asset.brand,
    unit: asset.unit,
    serialNumber: asset.serialNumber,
    status: asset.status,
    imageKey: asset.imageKey,
    imageUrl,
    assetType: asset.assetType,
    assignedTo: active ? toStaffDto(active.staff) : null,
    assignment: active ? toAssignmentDto(active) : null,
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
