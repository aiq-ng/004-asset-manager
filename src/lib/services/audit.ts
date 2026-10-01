import "server-only";

import { prisma } from "@/lib/prisma";
import type { ListAuditLogsQuery } from "@/lib/validators/audit";

/**
 * Read side of the audit trail.
 *
 * Only the SUPERADMIN role may read it: rows contain actor emails and client IP
 * addresses, which is exactly the kind of information the people being audited
 * must not be able to read themselves. Access is itself recorded, because the
 * read endpoint is privileged and an investigator will want to know who looked.
 */

export interface AuditLogDto {
  id: string;
  eventId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: unknown;
  metadata: unknown;
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
    role: string | null;
    /** False once the account has been deleted (the foreign key is SET NULL). */
    exists: boolean;
  };
  ipAddress: string | null;
  userAgent: string | null;
  route: string | null;
  occurredAt: string;
  /** When the worker persisted the row; `occurredAt` is the action time. */
  createdAt: string;
}

/** Newest-first audit rows plus the totals a paginated response needs. */

async function loadRows(where: object, page: number, pageSize: number) {
  return prisma.auditLog.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

function toDto(row: {
  id: string;
  eventId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  changes: unknown;
  metadata: unknown;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  route: string | null;
  occurredAt: Date;
  createdAt: Date;
}): AuditLogDto {
  return {
    id: row.id,
    eventId: row.eventId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    changes: row.changes ?? null,
    metadata: row.metadata ?? null,
    actor: {
      id: row.actorId,
      name: row.actorName,
      email: row.actorEmail,
      role: row.actorRole,
      exists: row.actorId !== null,
    },
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    route: row.route,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditLogs(query: ListAuditLogsQuery): Promise<{
  items: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where: Record<string, unknown> = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.from || query.to
      ? {
          occurredAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { summary: { contains: query.q, mode: "insensitive" } },
            { actorName: { contains: query.q, mode: "insensitive" } },
            { actorEmail: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    loadRows(where, query.page, query.pageSize),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map(toDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Every action name, so a UI can offer filters without hard-coding them. */
export async function auditActionCounts(): Promise<Record<string, number>> {
  const grouped = await prisma.auditLog.groupBy({
    by: ["action"],
    _count: { action: true },
    orderBy: { _count: { action: "desc" } },
  });

  return Object.fromEntries(grouped.map((row) => [row.action, row._count.action]));
}
