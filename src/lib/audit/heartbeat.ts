import { AUDIT_QUEUE_NAME } from "@/lib/audit/events";

/**
 * Liveness signalling for the audit worker.
 *
 * The audit trail is written by a separate process, so the app can be running
 * perfectly while nothing is draining the queue: `/audit` then shows "No events
 * yet" and the real cause is invisible. That is the failure mode this module
 * exists to close.
 *
 * The worker stamps a key on a timer; the API compares the stamp against the
 * clock and reports the queue depth alongside it. A missing or stale stamp plus
 * a non-zero depth is unambiguous: events are waiting and nobody is writing
 * them.
 *
 * Like `events.ts`, this module is deliberately free of `server-only` and
 * `node:*` imports so the worker process can import it directly.
 */

/**
 * Redis key holding the worker's last heartbeat, as an ISO timestamp.
 *
 * Namespaced by queue name so a second queue in the same Redis cannot collide
 * with this one, and short enough to be recognisable in `redis-cli KEYS`.
 */
export const AUDIT_HEARTBEAT_KEY = `${AUDIT_QUEUE_NAME}:worker-heartbeat`;

/**
 * How often the worker stamps the key.
 *
 * Short enough that a crash is noticed quickly, long enough that a busy event
 * loop or a momentary GC pause is not mistaken for a dead worker.
 */
export const AUDIT_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * How stale a stamp may be before the worker counts as down.
 *
 * Three missed beats. Generous on purpose: this drives a warning shown to
 * SUPERADMIN, and a false alarm during a deploy would train people to ignore it.
 * The cost of being late is that the trail stays visibly stale for a few more
 * seconds, which is not a correctness problem.
 */
export const AUDIT_HEARTBEAT_STALE_MS = 45_000;

/** Shape returned to the UI. Every field is safe to show to a SUPERADMIN. */
export interface AuditQueueHealth {
  /** A stamp exists and is younger than `AUDIT_HEARTBEAT_STALE_MS`. */
  workerRunning: boolean;
  /** When the worker last stamped the key, or null if it never has. */
  lastSeenAt: string | null;
  /** Events queued but not yet written to PostgreSQL. */
  waiting: number;
  /** Events the worker is writing right now. */
  active: number;
  /** Events that exhausted their retries. Written off; needs an operator. */
  failed: number;
  /** Events waiting on a backoff timer between retries. */
  delayed: number;
}

/** Health for a worker that has never run, so the UI always has a shape. */
export const UNKNOWN_AUDIT_HEALTH: AuditQueueHealth = {
  workerRunning: false,
  lastSeenAt: null,
  waiting: 0,
  active: 0,
  failed: 0,
  delayed: 0,
};

/**
 * Decides whether a heartbeat stamp is fresh.
 *
 * Takes `now` as an argument rather than reading the clock so the caller can
 * decide what "now" means: the API passes the request time, which keeps this
 * deterministic and testable.
 */
export function isHeartbeatFresh(
  stampedAt: string | null,
  now: Date,
): stampedAt is string {
  if (!stampedAt) return false;

  const at = Date.parse(stampedAt);
  if (Number.isNaN(at)) return false;

  // A stamp from the future means clock skew, not a dead worker. Treat it as
  // fresh: refusing to trust it would raise an alarm we cannot act on.
  const age = now.getTime() - at;
  if (age < 0) return true;

  return age < AUDIT_HEARTBEAT_STALE_MS;
}

/**
 * True when events are piling up with nobody to write them.
 *
 * This is the exact condition that silently loses the trail, and it is
 * deliberately stricter than `!workerRunning`: a queue that is empty because the
 * worker is down has not lost anything, and warning about it would be noise. It
 * only bites when there is real work waiting.
 */
export function hasAuditBacklog(health: AuditQueueHealth): boolean {
  return !health.workerRunning && health.waiting > 0;
}