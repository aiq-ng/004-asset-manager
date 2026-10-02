import { Badge } from "@/components/ui/badge";

import { rolePresentation } from "@/features/staff/role-presentation";

/** Role chip. A Server Component, so it costs nothing to render per row. */
export function StaffRoleBadge({ role }: { role: string }) {
  const presentation = rolePresentation(role);

  return (
    <Badge tone={presentation.tone} title={presentation.summary}>
      {presentation.label}
    </Badge>
  );
}