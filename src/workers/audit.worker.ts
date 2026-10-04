// Must be first: `lib/prisma` and `lib/env` read process.env while they are
// being imported, so the .env file has to be loaded before anything else is
// evaluated. ESM evaluates imports in source order, so this works.
import "dotenv/config";

import { Worker, Job } from "bullmq";
import IORedis from "ioredis";

import { AUDIT_QUEUE_NAME } from "@/lib/audit/events";
import type { AuditEvent } from "@/lib/audit/events";
import { AUDIT_HEARTBEAT_INTERVAL_MS, AUDIT_HEARTBEAT_KEY } from "@/lib/audit/heartbeat";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

/**
 * The audit worker: consumes events from BullMQ and writes them to PostgreSQL.
 * It runs outside Next.js as a long-lived background process (`pnpm worker:audit`).
 *
 * Idempotency: the producer uses `eventId` as the BullMQ job id and this worker
 * does an upsert on `eventId`, so a crash/retry can never create two rows for the
 * same event. The audit trail is immutable at the DB layer as well (triggers
 * block UPDATE/DELETE).
 */

/**
 * The worker reconnects forever - unlike the API, which gives up quickly (see
 * `ENQUEUE_DEADLINE_MS` in `lib/audit/queue.ts`). An audit worker that stops
 * trying is worse than one that is briefly quiet: jobs stay in Redis, AOF keeps
 * them across a Redis restart, and they drain when the worker is back.
 *
 * Run this under a supervisor (systemd unit, `docker run --restart=always`, or a
 * process manager). A hard kill (`SIGKILL`, an OOM) cannot be handled in-process,
 * and BullMQ does not always recover a worker whose socket died mid-flight, so
 * the restart policy is what makes that case self-healing.
 */
function createConnection(): IORedis {
  return new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 5_000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    ...(getEnv().AUDIT_REDIS_PREFIX ? { keyPrefix: getEnv().AUDIT_REDIS_PREFIX } : {}),
  });
}

const connection = createConnection();

const worker = new Worker<AuditEvent>(
  AUDIT_QUEUE_NAME,
  async (job: Job<AuditEvent>) => {
    const event = job.data;

    // The queue is asynchronous, so an account can be deleted between the moment
    // an event was published and the moment it is persisted here. The
    // `AuditLog.actorId` foreign key is `onDelete: SetNull`, which covers a row
    // that already exists when the staff member goes; it does nothing for a row
    // inserted afterwards, so the insert would fail with P2003, retry five times
    // and drop the event.
    //
    // That silently lost the tail of somebody's activity — and the trail is
    // explicitly built to keep it: `actor.exists` is documented as "false once the
    // account has been deleted", and the audit page renders "(account deleted)".
    // So the actor's identity is kept in the denormalised columns and only the
    // reference is dropped, which is exactly the state that read model expects.
    const actorId =
      event.actorId && (await prisma.staff.count({ where: { id: event.actorId } })) > 0
        ? event.actorId
        : null;

    await prisma.auditLog.upsert({
      where: { eventId: event.eventId },
      create: {
        eventId: event.eventId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        summary: event.summary,
        // `null` means "there was nothing to record", not JSON null.
        changes: (event.changes ?? Prisma.DbNull) as Prisma.InputJsonValue,
        metadata: (event.metadata ?? Prisma.DbNull) as Prisma.InputJsonValue,
        actorId,
        actorName: event.actorName,
        actorEmail: event.actorEmail,
        actorRole: event.actorRole,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        route: event.route,
        occurredAt: new Date(event.occurredAt),
      },
      update: {},
    });
  },
  {
    connection,
    concurrency: 10,
  },
);

/**
 * Stamps the liveness key so `/audit` can tell "no activity yet" apart from
 * "activity is queued and nothing is draining it".
 *
 * Best-effort by design: if Redis is briefly unhappy the heartbeat fails, the
 * page shows a warning for a few seconds, and the next tick clears it. A
 * heartbeat that could fail the worker would be a worse trade than a stale one.
 */
async function beat(): Promise<void> {
  try {
    await connection.set(AUDIT_HEARTBEAT_KEY, new Date().toISOString());
  } catch (error) {
    console.warn("[audit] could not write heartbeat", error);
  }
}

const heartbeat = setInterval(() => void beat(), AUDIT_HEARTBEAT_INTERVAL_MS);
// Do not hold the event loop open for the heartbeat on its own; the worker
// connection keeps the process alive on purpose.
heartbeat.unref?.();

worker.on("ready", () => {
  console.log("🛡️  audit worker ready — listening for events");
  void beat();
});

worker.on("failed", (job, error) => {
  console.error(`[audit] job ${job?.id ?? "unknown"} failed`, error);
});

worker.on("error", (error) => {
  console.error("[audit] worker error", error);
});

function shutdown(signal: string): void {
  console.log(`[audit] received ${signal}, closing worker...`);
  clearInterval(heartbeat);

  // Clear the liveness key so `/audit` reacts to a planned stop or a deploy
  // immediately, rather than waiting out the staleness window. A hard kill
  // cannot do this, which is exactly what that window is for.
  //
  // Assumes a single worker, which is what the deployment runs. If the worker
  // were ever scaled out, one instance stopping would clear the key while its
  // siblings are still beating, and the page would raise a false alarm.
  void connection
    .del(AUDIT_HEARTBEAT_KEY)
    .catch(() => undefined)
    .finally(() => worker.close())
    .finally(() => {
      void connection.disconnect();
    })
    .finally(() => {
      process.exit(0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
