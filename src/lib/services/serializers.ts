import type { Prisma, StaffRole } from "@/generated/prisma/client";

export const staffSelect = {
  id: true,
  name: true,
  department: true,
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
    include: { staff: { select: staffSelect } },
  },
} satisfies Prisma.AssetInclude;

/** Detail view variant: every assignment, newest first. */
export const assetWithHistoryInclude = {
  ...assetInclude,
  assignments: {
    orderBy: { dateAssigned: "desc" },
    include: { staff: { select: staffSelect } },
  },
} satisfies Prisma.AssetInclude;

export const assignmentInclude = {
  asset: { include: { assetType: { select: { id: true, name: true, code: true } } } },
  staff: { select: staffSelect },
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
};

export interface StaffDto {
  id: string;
  name: string;
  department: string;
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
}

export interface AssetDto {
  id: string;
  assetId: string;
  description: string;
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
    department: staff.department,
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
  };
}

type AssetRow = AssetRecord | AssetWithHistory;

function toAssetBase(asset: AssetRow, imageUrl: string | null): AssetDto {
  const active = asset.assignments[0] ?? null;

  return {
    id: asset.id,
    assetId: asset.assetId,
    description: asset.description,
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
