import { Crown, Info, ShieldCheck, User, UserPen } from "lucide-react";

import type { BadgeIcon, BadgeTone } from "@/components/ui/badge";
import { STAFF_ROLES } from "@/lib/validators/staff";

/**
 * Presentation mapping for the backend's `Staff.role`.
 *
 * Lives beside the staff feature rather than in `asset-status.ts`, where it had
 * ended up: the two enums are unrelated, and mixing them made the role labels
 * look like they belonged to assets.
 *
 * `SUPERADMIN` is not assignable through the UI — it is only granted by
 * `pnpm auth:create-superadmin` — so it appears here for display but never in the
 * role selector.
 */
export { STAFF_ROLES };

/** Roles a superadmin may hand out. Matches `assignableRoleSchema`. */
export const ASSIGNABLE_ROLES = ["USER", "ASSIGNER", "ADMIN"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const PRESENTATION: Record<
  StaffRole,
  { label: string; tone: BadgeTone; icon: BadgeIcon; summary: string }
> = {
  USER: {
    label: "User",
    tone: "neutral",
    icon: User,
    summary: "Can sign in and see the register. Cannot assign or manage assets.",
  },
  ASSIGNER: {
    label: "Assigner",
    tone: "info",
    // The same glyph as an assigned asset, deliberately: both are about the
    // act of handing something to somebody.
    icon: UserPen,
    summary: "Can assign and return assets, and change an asset's status.",
  },
  ADMIN: {
    label: "Admin",
    tone: "accent",
    icon: ShieldCheck,
    summary: "Everything an assigner can do, plus registering, editing and retiring assets.",
  },
  SUPERADMIN: {
    label: "Super admin",
    tone: "inverse",
    // A crown rather than a second shield: the two roles are adjacent on the
    // ladder and a shield each would not say which one is higher.
    icon: Crown,
    summary: "Full access, including staff, asset types and the audit log.",
  },
};

export function rolePresentation(role: string): {
  label: string;
  tone: BadgeTone;
  icon: BadgeIcon;
  summary: string;
} {
  return (
    PRESENTATION[role as StaffRole] ?? { label: role, tone: "neutral", icon: Info, summary: "" }
  );
}

/**
 * Who a given actor may hand assets to.
 *
 * Mirrors `requireAssignableTarget` in `lib/auth/permissions`, including its
 * documented rule that admins and above may assign to anybody — themselves
 * included. An earlier version of this helper also hid self and superadmin
 * targets, which quietly disagreed with the server: a picker missing rows the
 * service would happily accept is its own kind of bug.
 *
 * The service re-checks on write, so this is a convenience for the picker and
 * never the enforcement point.
 */
export function isAssignableTarget(
  actor: { id: string; role: string },
  target: { id: string; role: string },
): boolean {
  // ADMIN and SUPERADMIN are unrestricted, and return before the self-check —
  // the same ordering the service uses, which is what makes self-assignment
  // legal for them and illegal for everyone else.
  if (actor.role === "ADMIN" || actor.role === "SUPERADMIN") return true;
  if (target.id === actor.id) return false;
  if (actor.role === "ASSIGNER") return target.role === "USER" || target.role === "ASSIGNER";
  return false;
}