import type { StaffRole } from "@/generated/prisma/client";
import { ApiError } from "@/lib/errors";

/**
 * The permission matrix, enforced in the route layer (secure checks) via
 * `lib/auth/actor.ts` + this module.
 *
 * Roles form a hierarchy, each inheriting everything below it:
 *
 *   USER < ASSIGNER < ADMIN < SUPERADMIN
 *
 *   read (assets, types, staff, assignments)   any authenticated role
 *   assignment:create / assignment:return      ASSIGNER and up
 *   asset:updateStatus (status-only PATCH)     ASSIGNER and up
 *   asset:manage (CRUD, retire, images)        ADMIN and up
 *   assetType:manage                           ADMIN and up
 *   staff:manage (accounts + roles)            SUPERADMIN only
 *   department:manage (org structure)          SUPERADMIN only
 *   audit:read (the audit trail)                SUPERADMIN only
 *
 * SUPERADMIN is granted exactly once, by `pnpm auth:create-superadmin`, and is
 * never assignable through the API.
 */
export type Permission =
  | "assignment:create"
  | "assignment:return"
  | "asset:updateStatus"
  | "asset:manage"
  | "assetType:manage"
  | "staff:manage"
  | "department:manage"
  | "audit:read";

const RANK: Record<StaffRole, number> = {
  USER: 0,
  ASSIGNER: 1,
  ADMIN: 2,
  SUPERADMIN: 3,
};

const MINIMUM_ROLE: Record<Permission, StaffRole> = {
  "assignment:create": "ASSIGNER",
  "assignment:return": "ASSIGNER",
  "asset:updateStatus": "ASSIGNER",
  "asset:manage": "ADMIN",
  "assetType:manage": "ADMIN",
  "staff:manage": "SUPERADMIN",
  // Departments are org structure rather than day-to-day data, and a department
  // that vanishes would strand every account pointing at it. Same tier as the
  // accounts themselves.
  "department:manage": "SUPERADMIN",
  "audit:read": "SUPERADMIN",
};

export interface Actor {
  id: string;
  name: string;
  email: string;
  department: string;
  role: StaffRole;
  /**
   * True while signed in with a temporary password from an invite. Page guards
   * and API wrappers bounce the session to the password-change screen before
   * anything else in the app runs.
   */
  mustChangePassword: boolean;
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && value in RANK;
}

export function can(role: StaffRole, permission: Permission): boolean {
  return RANK[role] >= RANK[MINIMUM_ROLE[permission]];
}

/** Throws 403 unless the actor's role allows the permission. */
export function requirePermission(actor: Actor, permission: Permission): void {
  if (!can(actor.role, permission)) {
    throw ApiError.forbidden(
      `Role ${actor.role} cannot perform this action (requires ${MINIMUM_ROLE[permission]} or higher)`,
    );
  }
}

/**
 * Who an actor may hand an asset to.
 *
 *  - SUPERADMIN and ADMIN may assign to anybody, including themselves.
 *  - ASSIGNER may assign to users and other assigners, but never to themselves
 *    and never to an admin or the superadmin.
 */
export function requireAssignableTarget(
  actor: Actor,
  target: { id: string; role: StaffRole },
): void {
  if (RANK[actor.role] >= RANK.ADMIN) return;

  if (target.id === actor.id) {
    throw ApiError.forbidden(
      `${actor.role === "ASSIGNER" ? "Assigners" : "Users"} cannot assign assets to themselves`,
    );
  }

  if (RANK[target.role] > RANK.ASSIGNER) {
    throw ApiError.forbidden(
      `Role ${actor.role} can only assign assets to users and other assigners, not to a ${target.role}`,
    );
  }
}