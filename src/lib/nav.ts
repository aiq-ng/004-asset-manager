import type { StaffRole } from "@/generated/prisma/client";
import { can, type Permission } from "@/lib/auth/permissions";

/**
 * Navigation model.
 *
 * `permission` gates visibility of a *whole* entry, and is used only where the
 * backend hides a resource outright — the audit trail is SUPERADMIN-only. Areas
 * any role may read (assets, staff, departments, asset types) are always listed,
 * and their mutation controls are gated individually instead. That keeps a
 * low-privilege user's navigation stable rather than making items appear and
 * vanish.
 */
export type NavIcon =
  | "dashboard"
  | "box"
  | "swap"
  | "layers"
  | "users"
  | "building"
  | "archive"
  | "audit";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  /** Exact match for the index route, prefix match for everything else. */
  exact?: boolean;
  permission?: Permission;
  icon: NavIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    description: "Stock levels and recent activity",
    exact: true,
    icon: "dashboard",
  },
  { href: "/assets", label: "Assets", description: "Every tracked item", icon: "box" },
  {
    href: "/assignments",
    label: "Assignments",
    description: "Who has what, right now",
    icon: "swap",
  },
  { href: "/asset-types", label: "Asset types", description: "Categories and codes", icon: "layers" },
  { href: "/staff", label: "Staff", description: "People and roles", icon: "users" },
  {
    href: "/departments",
    label: "Departments",
    description: "The shared department list",
    icon: "building",
  },
  {
    href: "/archive",
    label: "Archive",
    description: "Records taken off the register",
    // Unlike the areas above, the archive hides rows from everyone else
    // entirely, so the entry itself is gated rather than showing an empty
    // screen to somebody who is not allowed to see it.
    permission: "archive:read",
    icon: "archive",
  },
  // {
  //   href: "/audit",
  //   label: "Audit trail",
  //   description: "Every recorded change",
  //   permission: "audit:read",
  //   icon: "audit",
  // },
];

export function navItemsFor(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission));
}