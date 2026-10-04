import { Archive, CircleCheck, Info, UserPen, Wrench } from "lucide-react";

import type { BadgeIcon, BadgeTone } from "@/components/ui/badge";

/**
 * Presentation mapping for the backend's `Asset.status`.
 *
 * The service returns raw enum strings; the UI needs labels and colours. Keeping
 * the mapping in one place means a status can never render as an unknown badge in
 * one screen and correctly in another.
 *
 * `ASSIGNED` is derived by the services from an open assignment, so it only ever
 * appears on reads, never in the status selector of a form.
 */
export const ASSET_STATUSES = ["AVAILABLE", "ASSIGNED", "UNDER_REPAIR", "RETIRED"] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

const PRESENTATION: Record<
  AssetStatus,
  { label: string; tone: BadgeTone; icon: BadgeIcon; hint: string }
> = {
  AVAILABLE: {
    label: "Available",
    tone: "success",
    icon: CircleCheck,
    hint: "In stock and ready to hand out",
  },
  ASSIGNED: {
    label: "Assigned",
    tone: "info",
    // A person signing for it, not a box: what distinguishes this status from
    // every other one is that it is *someone's* right now.
    icon: UserPen,
    hint: "Currently held by a member of staff",
  },
  UNDER_REPAIR: {
    label: "Under repair",
    tone: "warning",
    icon: Wrench,
    hint: "Out of service pending a repair",
  },
  RETIRED: {
    label: "Retired",
    tone: "neutral",
    icon: Archive,
    hint: "Permanently withdrawn from the register",
  },
};

export function statusPresentation(status: string): {
  label: string;
  tone: BadgeTone;
  icon: BadgeIcon;
  hint: string;
} {
  return (
    PRESENTATION[status as AssetStatus] ?? {
      label: status,
      tone: "neutral",
      icon: Info,
      hint: "",
    }
  );
}

export const ROLE_LABELS: Record<string, string> = {
  USER: "User",
  ASSIGNER: "Assigner",
  ADMIN: "Admin",
  SUPERADMIN: "Super admin",
};