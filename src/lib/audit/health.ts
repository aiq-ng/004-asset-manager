import "server-only";

import IORedis from "ioredis";
import type { Queue } from "bullmq";

import {
  AUDIT_HEARTBEAT_KEY,
  isHeartbeatFresh,
  UNKNOWN_AUDIT_HEALTH,
  type AuditQueueHealth,
} from "@/lib/audit/heartbeat";
import { getAuditQueue } from "@/lib/audit/queue";
import { getEnv } from "@/lib/env";

/**
 * Read side of the audit heartbeat: is anything draining the queue?
 *
 * Separate from `queue.ts` because the producer's job is to publish and forget.
 * This module exists so the one page whose whole purpose is accountability
 * cannot quietly render an empty trail while events sit undelivered in Redis.
 *
 * Every path here degrades instead of throwing. A missing Redis must not take
 * down `/audit`: it makes the trail incomplete, which is exactly what the
 * caller needs to be able to *see*, so failing loudly would remove the very
 * signal this is for.
 */

/** Give Redis a moment, but never hang a page render waiting on it. */
const HEALTH_TIMEOUT_MS = 1_500;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work,
    new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      timer.unref?.();
    }),
  ]);
}

/**
 * A short-lived connection for reading the heartbeat key.
 *
 * BullMQ's `Queue` connection is namespaced and prefixed for queue management;
 * the heartbeat is an ordinary key we own, so it gets its own connection
 * configured the same way the worker writes it.
 */
function createReaderConnection(): IORedis {
  return new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: HEALTH_TIMEOUT_MS,
    connectTimeout: HEALTH_TIMEOUT_MS,
    enableReadyCheck: false,
    lazyConnect: true,
    ...(getEnv().AUDIT_REDIS_PREFIX ? { keyPrefix: getEnv().AUDIT_REDIS_PREFIX } : {}),
  });
}

/**
 * Counts the jobs that matter, in one round trip.
 *
 * `completed` is excluded: the producer keeps finished jobs for an hour, so that
 * count only reflects the retention window and would read as a backlog.
 */
async function readDepth(queue: Queue): Promise<Pick<
  AuditQueueHealth,
  "waiting" | "active" | "failed" | "delayed"
>> {
  const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed");

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

/**
 * Current audit pipeline health, or a safe default when Redis is unreachable.
 *
 * `lastSeenAt` is reported even when the worker looks dead: knowing a worker was
 * beating five minutes ago and then stopped is far more useful to an operator
 * than "unknown", because it points at what changed.
 */
export async function getAuditQueueHealth(): Promise<AuditQueueHealth> {
  const reader = createReaderConnection();

  try {
    const result = await withTimeout(
      Promise.all([
        reader.get(AUDIT_HEARTBEAT_KEY),
        readDepth(getAuditQueue()),
      ]),
      HEALTH_TIMEOUT_MS,
    );

    // Timed out: we know nothing, so say nothing rather than claim a worker is
    // down when we simply could not reach Redis to find out.
    if (!result) return UNKNOWN_AUDIT_HEALTH;

    const [stampedAt, depth] = result;

    const now = new Date();

    return {
      workerRunning: isHeartbeatFresh(stampedAt, now),
      lastSeenAt: stampedAt,
      ...depth,
    };
  } catch {
    return UNKNOWN_AUDIT_HEALTH;
  } finally {
    reader.disconnect();
  }
}