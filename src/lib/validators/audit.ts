import { z } from "zod";

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/events";
import { paginationSchema } from "@/lib/validators/common";

export const listAuditLogsQuerySchema = paginationSchema.extend({
  /** Exact action, e.g. "ASSIGNMENT_CREATED". */
  action: z.enum(AUDIT_ACTIONS).optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  /** Database id of the affected row. */
  entityId: z.string().trim().min(1).max(64).optional(),
  /** Free-text filter: searches the summary and the actor's name/email. */
  q: z.string().trim().min(1).max(120).optional(),
  /** ISO-8601 bounds on when the action happened (not when it was stored). */
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;