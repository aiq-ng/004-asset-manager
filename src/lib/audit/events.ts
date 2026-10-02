/**
 * The audit vocabulary, shared by the producer (Next.js) and the worker.
 *
 * Deliberately free of any `server-only` or `node:*` imports: the worker process
 * runs under plain tsx, where `server-only` throws, and must be able to import
 * the same names the API uses. That way an action name can never drift between
 * the two sides.
 */

export const AUDIT_QUEUE_NAME = "audit-log-queue";

export const AUDIT_ACTIONS = {
  LOGIN_SUCCEEDED: "LOGIN_SUCCEEDED",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",

  ASSET_CREATED: "ASSET_CREATED",
  ASSET_UPDATED: "ASSET_UPDATED",
  ASSET_RETIRED: "ASSET_RETIRED",
  ASSET_IMAGE_UPLOADED: "ASSET_IMAGE_UPLOADED",
  ASSET_IMAGE_REMOVED: "ASSET_IMAGE_REMOVED",

  ASSET_TYPE_CREATED: "ASSET_TYPE_CREATED",
  ASSET_TYPE_UPDATED: "ASSET_TYPE_UPDATED",

  DEPARTMENT_CREATED: "DEPARTMENT_CREATED",
  DEPARTMENT_RENAMED: "DEPARTMENT_RENAMED",
  DEPARTMENT_DELETED: "DEPARTMENT_DELETED",

  STAFF_CREATED: "STAFF_CREATED",
  STAFF_UPDATED: "STAFF_UPDATED",
  STAFF_ROLE_CHANGED: "STAFF_ROLE_CHANGED",
  STAFF_PASSWORD_RESET: "STAFF_PASSWORD_RESET",
  STAFF_DELETED: "STAFF_DELETED",

  ASSIGNMENT_CREATED: "ASSIGNMENT_CREATED",
  ASSIGNMENT_RETURNED: "ASSIGNMENT_RETURNED",

  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ENTITY_TYPES = [
  "SESSION",
  "ASSET",
  "ASSET_TYPE",
  "DEPARTMENT",
  "STAFF",
  "ASSIGNMENT",
  "PERMISSION",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Field-level before/after values. Never contains secrets. */
export type AuditChanges = Record<string, { from: unknown; to: unknown } | unknown>;

export interface AuditEvent {
  /** UUID, also used as the BullMQ job id so retries cannot duplicate a row. */
  eventId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  /** Database id of the affected row, when there is one. */
  entityId?: string | null;
  /** Human-readable sentence, e.g. "Retired asset IT-LAP-0007". */
  summary: string;
  changes?: AuditChanges | null;
  metadata?: Record<string, unknown> | null;

  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;

  ipAddress: string | null;
  userAgent: string | null;
  /** Route that produced the event, e.g. "POST /api/assignments". */
  route: string | null;

  /** When the action happened, not when the worker got round to writing it. */
  occurredAt: string;
}

/**
 * Keys that must never leave the server inside `changes` or `metadata`, even if
 * a caller passes them by mistake. Passwords are stored hashed and session
 * tokens are bearer credentials, so either one in the audit trail would be a
 * leak; the queue is a place data tends to outlive its controls.
 */
const REDACTED_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "passwordhash",
  "token",
  "sessiontoken",
  "authorization",
  "cookie",
  "secret",
]);

export const REDACTED = "[redacted]";

/** Deep copy with secret-looking keys replaced. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : redact(item, depth + 1);
  }
  return result;
}

/**
 * Builds the `{ from, to }` pairs for the fields a request actually touched.
 * Only keys present in `input` end up in the diff, so an absent field never
 * looks like "cleared".
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  input: Partial<T>,
  transform?: (value: unknown) => unknown,
): AuditChanges {
  const changes: AuditChanges = {};

  for (const [key, next] of Object.entries(input)) {
    if (next === undefined) continue;

    const previous = before[key];
    const from = transform ? transform(previous) : previous;
    const to = transform ? transform(next) : next;

    // Compare normalised JSON so 1 vs "1" or null vs undefined do not produce
    // noise, but keep the original values for the reader.
    if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) continue;

    changes[key] = { from: redact(from) ?? null, to: redact(to) ?? null };
  }

  return changes;
}