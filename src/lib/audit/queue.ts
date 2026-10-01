import "server-only";

import { randomUUID } from "node:crypto";

import { Queue } from "bullmq";
import IORedis from "ioredis";

import { AUDIT_QUEUE_NAME, redact, type AuditEvent } from "@/lib/audit/events";
import {
  setAuditPublisher,
  type AuditEventInput,
  type RequestContext,
} from "@/lib/audit/context";
import { getEnv } from "@/lib/env";

/**
 * Producer half of the audit pipeline.
 *
 * Request handlers publish here and return as soon as Redis accepts the job; a
 * separate worker process (`pnpm worker:audit`) drains the queue into
 * PostgreSQL. Slow audit storage therefore cannot slow down the API, and a
 * database hiccup cannot roll back a business operation that already committed.
 *
 * Two deliberate trade-offs:
 *   1. A queue write is awaited (one Redis round trip, sub-millisecond locally)
 *      rather than fire-and-forget, so a successful response means the event is
 *      durably queued and not silently lost to an unhandled rejection.
 *   2. Enqueue failures do *not* fail the request. The audit trail is important,
 *      but a Redis outage should not stop people from handing out laptops. The
 *      failure is logged and a short circuit-breaker stops us retrying on every
 *      single request while Redis is down.
 */

/** Job options shared by every event. */
const JOB_OPTIONS = {
  // Audit writes are critical: retry with exponential backoff if the worker or
  // the database is briefly unavailable.
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 }, // 2s, 4s, 8s, 16s, 32s
  // Completed jobs are kept an hour so a slow consumer or an operator can still
  // inspect them, then removed to keep Redis small. Failures are kept a day.
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;

/**
 * Hard ceiling on how long a request may wait for Redis.
 *
 * This matters more than it looks. With BullMQ's usual `maxRetriesPerRequest:
 * null` the enqueue never rejects while Redis is unreachable - it just waits
 * for the reconnect - so a Redis outage would stall the API that is supposed to
 * be immune to it. The producer therefore uses a *finite* retry count (which
 * BullMQ only requires for Workers) plus a command timeout, and the add is
 * raced against a deadline for good measure.
 */
const ENQUEUE_DEADLINE_MS = 1_000;

function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`audit enqueue timed out after ${ms}ms`)),
        ms,
      );
      // Do not hold the event loop open for a timer nobody is waiting on.
      timer.unref?.();
    }),
  ]);
}

let connection: IORedis | null = null;
let queue: Queue<AuditEvent> | null = null;

let consecutiveFailures = 0;
let breakerOpenUntil = 0;

/**
 * Producer-side Redis connection. See `ENQUEUE_DEADLINE_MS` for why the retry
 * budget is finite here. `lazyConnect` keeps the constructor free of I/O so
 * importing this module in a process that never audits (a build, a script)
 * does not open a socket.
 */
function getConnection(): IORedis {
  connection ??= new IORedis(getEnv().REDIS_URL, {
    // Finite: a producer must give up rather than wait out an outage.
    maxRetriesPerRequest: 1,
    commandTimeout: ENQUEUE_DEADLINE_MS,
    connectTimeout: ENQUEUE_DEADLINE_MS,
    retryStrategy: (attempt) => Math.min(attempt * 250, 2_000),
    enableReadyCheck: false,
    lazyConnect: true,
    ...(getEnv().AUDIT_REDIS_PREFIX ? { keyPrefix: getEnv().AUDIT_REDIS_PREFIX } : {}),
  });

  return connection;
}

export function getAuditQueue(): Queue<AuditEvent> {
  queue ??= new Queue<AuditEvent>(AUDIT_QUEUE_NAME, { connection: getConnection() });
  return queue;
}

function breakerIsOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}

function noteSuccess(): void {
  if (consecutiveFailures === 0) return;

  consecutiveFailures = 0;
  breakerOpenUntil = 0;
  console.info("[audit] queue reachable again, resuming audit events");
}

function noteFailure(error: unknown): void {
  consecutiveFailures += 1;

  if (consecutiveFailures >= BREAKER_THRESHOLD && !breakerIsOpen()) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.error(
      `[audit] queue unreachable after ${consecutiveFailures} attempts; ` +
        `pausing audit events for ${BREAKER_COOLDOWN_MS / 1000}s ` +
        `(is Redis running at ${getEnv().REDIS_URL}?)`,
    );
    return;
  }

  console.error("[audit] could not enqueue audit event", error);
}

/**
 * Publishes one event. Returns once Redis has accepted it.
 *
 * `jobId` is the event's UUID, so BullMQ silently ignores a re-published event
 * while the finished job is still around. The worker additionally upserts on
 * `eventId`, which covers the case where Redis was flushed or the dedupe window
 * had already passed — the database, not Redis, is the real idempotency guard.
 */
export async function enqueueAuditEvent(event: AuditEventInput): Promise<void> {
  if (breakerIsOpen()) return;

  const full: AuditEvent = {
    eventId: randomUUID(),
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    summary: event.summary,
    changes: event.changes ?? null,
    metadata: event.metadata ?? null,
    actorId: event.actor?.id ?? null,
    actorName: event.actor?.name ?? null,
    actorEmail: event.actor?.email ?? null,
    actorRole: event.actor?.role ?? null,
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
    route: event.route ?? null,
    occurredAt: new Date().toISOString(),
  };

  try {
    await deadline(
      getAuditQueue().add("log-event", redact(full) as AuditEvent, {
        ...JOB_OPTIONS,
        jobId: full.eventId,
      }),
      ENQUEUE_DEADLINE_MS,
    );
    noteSuccess();
  } catch (error) {
    noteFailure(error);
  }
}

/** Installed into `recordAudit` so services never import BullMQ themselves. */
export function installAuditPublisher(): void {
  setAuditPublisher(enqueueAuditEvent);
}

/** Lets a request pipeline publish with its own route/ip/user-agent. */
export function publisherFor(context: RequestContext) {
  return (event: AuditEventInput) =>
    enqueueAuditEvent({
      ...event,
      ipAddress: event.ipAddress ?? context.ipAddress,
      userAgent: event.userAgent ?? context.userAgent,
      route: event.route ?? context.route,
    });
}