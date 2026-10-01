// Must be first: `lib/prisma` and `lib/env` read process.env while they are
// being imported, so the .env file has to be loaded before anything else is
// evaluated. ESM evaluates imports in source order, so this works.
import "dotenv/config";

import { Worker, Job } from "bullmq";
import IORedis from "ioredis";

import { AUDIT_QUEUE_NAME } from "@/lib/audit/events";
import type { AuditEvent } from "@/lib/audit/events";
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
        actorId: event.actorId,
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

worker.on("ready", () => {
  console.log("🛡️  audit worker ready — listening for events");
});

worker.on("failed", (job, error) => {
  console.error(`[audit] job ${job?.id ?? "unknown"} failed`, error);
});

worker.on("error", (error) => {
  console.error("[audit] worker error", error);
});

function shutdown(signal: string): void {
  console.log(`[audit] received ${signal}, closing worker...`);
  void worker
    .close()
    .finally(() => {
      void connection.disconnect();
    })
    .finally(() => {
      process.exit(0);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
