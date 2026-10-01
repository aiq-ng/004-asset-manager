import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { Actor } from "@/lib/auth/permissions";
import type {
  AuditAction,
  AuditChanges,
  AuditEntityType,
} from "@/lib/audit/events";

/**
 * Per-request audit context.
 *
 * Services need three things an audit row requires but a service signature
 * cannot sanely carry: who is acting, where the call came from, and which route
 * it was. Threading them through every function is invasive and easy to forget,
 * so the request pipeline publishes them once (see `runWithRequestContext` in
 * `lib/api.ts`) and `recordAudit` reads them back.
 *
 * AsyncLocalStorage keeps this correct across `await` boundaries and across
 * concurrent requests, which a module-level variable would not.
 */
export interface RequestContext {
  /** Null on unauthenticated endpoints such as login. */
  actor: Actor | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** e.g. "POST /api/assignments". */
  route: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  handler: () => T,
): T {
  return storage.run(context, handler);
}

export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

/**
 * Best-effort client address. Behind nginx/Vercel the socket address is the
 * proxy, so the forwarded header wins; the first entry is the original client.
 */
export function clientIpFrom(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    null
  );
}

export interface RecordAuditInput {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  summary: string;
  changes?: AuditChanges | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Overrides the ambient actor. Sign-in failures have no session yet, so the
   * login service passes the address it attempted to match.
   */
  actor?: Actor | null;
}

/** What `enqueueAuditEvent` needs, independent of the ambient request. */
export interface AuditEventInput extends RecordAuditInput {
  ipAddress?: string | null;
  userAgent?: string | null;
  route?: string | null;
}

export type AuditPublisher = (event: AuditEventInput) => Promise<void>;

/**
 * Overridable publisher. Kept as a module-level seam so the services can be
 * exercised (and the queue disabled in tests) without importing BullMQ, and so
 * `lib/api.ts` can install the real one without a circular import.
 */
let publisher: AuditPublisher = async () => {};

export function setAuditPublisher(next: AuditPublisher): void {
  publisher = next;
}

/**
 * Records an audit event for the current request. Resolves once the event has
 * been handed to the queue — never once it has been written to PostgreSQL,
 * which is the worker's job.
 *
 * Never throws: the publisher is responsible for its own error handling, because
 * a logging failure must not roll back or fail the business operation.
 */
export function recordAudit(input: RecordAuditInput): Promise<void> {
  const context = getRequestContext();

  return publisher({
    ...input,
    actor: input.actor !== undefined ? input.actor : (context?.actor ?? null),
    ipAddress: context?.ipAddress ?? null,
    userAgent: context?.userAgent ?? null,
    route: context?.route ?? null,
  });
}