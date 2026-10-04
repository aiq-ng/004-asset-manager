import type { BadgeIcon, BadgeTone } from "@/components/ui/badge";
import { Icons } from "@/components/ui/icons";

/**
 * Presentation for audit actions and entity types.
 *
 * The audit trail is the screen an investigator reads, so the grouping matters as
 * much as the colours: authentication, lifecycle, privilege and access-control
 * events have to be distinguishable at a glance in a long list.
 */
export type AuditGroup = "auth" | "asset" | "assignment" | "staff" | "security";

interface ActionPresentation {
  label: string;
  group: AuditGroup;
  tone: BadgeTone;
  /**
   * What the row is about, not just how bad it was. Three events share the
   * `danger` tone — a failed sign-in, a deleted account, a refused request —
   * and a single red dot gave an investigator nothing to tell them apart.
   */
  icon: BadgeIcon;
}

const ACTIONS: Record<string, ActionPresentation> = {
  LOGIN_SUCCEEDED: { label: "Sign in", group: "auth", tone: "neutral", icon: Icons.LogIn },
  LOGIN_FAILED: { label: "Sign in failed", group: "security", tone: "danger", icon: Icons.CircleAlert },
  LOGOUT: { label: "Sign out", group: "auth", tone: "neutral", icon: Icons.Logout },
  PASSWORD_CHANGED: { label: "Password changed", group: "security", tone: "warning", icon: Icons.Lock },

  ASSET_CREATED: { label: "Asset registered", group: "asset", tone: "success", icon: Icons.CircleCheck },
  ASSET_UPDATED: { label: "Asset updated", group: "asset", tone: "info", icon: Icons.Edit },
  ASSET_RETIRED: { label: "Asset retired", group: "asset", tone: "warning", icon: Icons.Archive },
  ASSET_IMAGE_UPLOADED: { label: "Image uploaded", group: "asset", tone: "neutral", icon: Icons.Upload },
  ASSET_IMAGE_REMOVED: { label: "Image removed", group: "asset", tone: "neutral", icon: Icons.Image },

  ASSET_TYPE_CREATED: { label: "Type created", group: "asset", tone: "success", icon: Icons.Grid },
  ASSET_TYPE_UPDATED: { label: "Type updated", group: "asset", tone: "info", icon: Icons.Edit },

  STAFF_CREATED: { label: "Staff created", group: "staff", tone: "success", icon: Icons.UserPlus },
  STAFF_UPDATED: { label: "Staff updated", group: "staff", tone: "info", icon: Icons.Edit },
  // A privilege change is the row an investigation starts from, so it gets its
  // own emphasis rather than being folded into "Staff updated".
  STAFF_ROLE_CHANGED: { label: "Role changed", group: "security", tone: "accent", icon: Icons.Shield },
  STAFF_PASSWORD_RESET: { label: "Password reset", group: "security", tone: "warning", icon: Icons.Lock },
  STAFF_DELETED: { label: "Staff deleted", group: "staff", tone: "danger", icon: Icons.Trash },

  ASSIGNMENT_CREATED: { label: "Assigned", group: "assignment", tone: "info", icon: Icons.ArrowRight },
  ASSIGNMENT_RETURNED: { label: "Returned", group: "assignment", tone: "neutral", icon: Icons.ArrowLeft },

  AUTHORIZATION_DENIED: { label: "Access denied", group: "security", tone: "danger", icon: Icons.CircleAlert },
};

const FALLBACK: ActionPresentation = {
  label: "",
  group: "asset",
  tone: "neutral",
  icon: Icons.Info,
};

export function actionPresentation(action: string): ActionPresentation {
  const entry = ACTIONS[action];
  if (entry) return entry;
  // An action this build does not know about still has to render readably
  // rather than as a blank chip.
  return { ...FALLBACK, label: humanize(action) };
}

/** `STAFF_ROLE_CHANGED` → `Staff role changed`. */
export function humanize(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, " ").trim();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const ENTITY_HREFS: Record<string, (id: string) => string> = {
  ASSET: (id) => `/assets/${id}`,
  STAFF: (id) => `/staff/${id}`,
};

/**
 * Where an entity link should point.
 *
 * Assets are addressed by their human id on the frontend while the audit row
 * stores the database id, so only links whose target is the raw id are offered —
 * guessing would produce 404s that look like missing data.
 */
export function entityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  return ENTITY_HREFS[entityType]?.(entityId) ?? null;
}