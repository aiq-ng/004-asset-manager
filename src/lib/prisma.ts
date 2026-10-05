import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getEnv().DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Resolved on first use, and cached on `globalThis` in development so Next.js
 * hot reloads reuse one connection pool instead of leaking a new one per
 * rebuild.
 *
 * Deliberately *not* built at import time. Constructing the client validates the
 * whole environment (`APP_URL`, `MINIO_*`, `SESSION_SECRET`), which is right for
 * a request handler — that code cannot run without all of it — but it meant that
 * merely importing any module that reaches this file was enough to throw. The
 * `pnpm auth:create-superadmin` CLI is the case that matters: it builds its own
 * client from `DATABASE_URL` and is meant to be the tool you reach for on a
 * machine where the app has never been configured, yet importing the shared
 * `bootstrapSuperadmin` service dragged this in and took the whole script down.
 *
 * Deferring to first use keeps every call site unchanged — `prisma.staff.…`
 * still works, including inside scripts that never talk to a server.
 */
function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }

  return globalForPrisma.prisma;
}

/**
 * Singleton Prisma client. A proxy rather than an eagerly-constructed instance,
 * so the connection is not opened — and the environment not validated — until
 * something actually queries through it.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property, client);

    // Bound to the client so `$transaction`, `$queryRaw`, `$executeRaw` and the
    // model delegates keep their `this` when destructured off the proxy.
    return typeof value === "function" ? value.bind(client) : value;
  },
});