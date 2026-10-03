import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ZodError, ZodType } from "zod";

import { getActor, requireActor } from "@/lib/auth/actor";
import type { Actor, Permission } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { AUDIT_ACTIONS } from "@/lib/audit/events";
import {
  clientIpFrom,
  recordAudit,
  runWithRequestContext,
} from "@/lib/audit/context";
import { installAuditPublisher } from "@/lib/audit/queue";
import { ApiError, fromPrismaError } from "@/lib/errors";

// Installing the publisher once per process keeps BullMQ out of every service.
installAuditPublisher();

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ResponseMeta = PaginationMeta | Record<string, unknown>;

export interface SuccessBody<T> {
  data: T;
  meta?: ResponseMeta;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T, meta?: ResponseMeta): NextResponse<SuccessBody<T>> {
  return NextResponse.json(meta ? { data, meta } : { data });
}

export function created<T>(data: T, meta?: ResponseMeta): NextResponse<SuccessBody<T>> {
  return NextResponse.json(meta ? { data, meta } : { data }, { status: 201 });
}

export function paginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}

/** Converts a `zod` issue list into the `details` array of an error response. */
function formatIssues(error: ZodError): unknown[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Parses `input` or throws a 400 with field-level details.
 * Works for JSON bodies as well as URL search params.
 */
export function parseOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw ApiError.badRequest("Invalid request", formatIssues(result.error));
}

/** Parses JSON, turning malformed bodies into a 400 instead of a 500. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw ApiError.badRequest("Request body must be valid JSON");
  }
}

/** Validates `multipart/form-data`, turning malformed bodies into a 400. */
export async function parseFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw ApiError.badRequest("Request body must be valid multipart/form-data");
  }
}

/**
 * Single place where thrown values become HTTP responses: ApiError verbatim,
 * Prisma errors mapped, anything else logged and masked as a 500.
 */
export function handleError(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  const apiError = fromPrismaError(error);
  if (apiError.status >= 500) {
    console.error("[api] unhandled error", error);
  }
  return NextResponse.json(
    { error: { code: apiError.code, message: apiError.message, details: apiError.details } },
    { status: apiError.status },
  );
}

/**
 * Wraps a route handler so it can simply throw and stay free of try/catch.
 *
 * Authentication happens here, not in each handler: the session is resolved
 * before the handler runs, so a route cannot forget to check it. Handlers that
 * need to know who is calling call `requireActor()` (memoised per request) or
 * use `permissionRoute` below. `publicRoute` is for the few endpoints that must
 * work without a session (`/api/auth/login`).
 *
 * The same wrapper publishes an audit context (actor, client IP, user agent,
 * route) for the duration of the handler, which is what lets services call
 * `recordAudit()` without receiving that information as arguments.
 */
type RouteHandler<Ctx> = (request: NextRequest, ctx: Ctx) => Promise<NextResponse>;

function withRequestPipeline<Ctx>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (request, ctx) => {
    // Resolved up front so the audit context always knows who is calling, and
    // so the cost is paid once: `getActor` is memoised for the request, so the
    // later `requireActor()` call is a cache hit.
    const actor = await getActor();

    try {
      return await runWithRequestContext(
        {
          actor,
          ipAddress: clientIpFrom(request),
          userAgent: request.headers.get("user-agent"),
          route: `${request.method} ${request.nextUrl.pathname}`,
        },
        () => handler(request, ctx),
      );
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * The allow-list of endpoints an invited session may reach while it is still
 * carrying a temporary password: set their own password, sign out, or read who
 * they are. Everything else waits until the password is replaced.
 */
const PASSWORD_CHANGE_EXEMPT_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/me",
]);

function assertPasswordReplaced(actor: Actor, pathname: string): void {
  if (actor.mustChangePassword && !PASSWORD_CHANGE_EXEMPT_PATHS.has(pathname)) {
    throw ApiError.forbidden(
      "This account is signed in with a temporary password. Set a new one before continuing.",
    );
  }
}

/** Any signed-in user. */
export function apiRoute<Ctx>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return withRequestPipeline(async (request, ctx) => {
    const actor = await requireActor();
    assertPasswordReplaced(actor, request.nextUrl.pathname);
    return handler(request, ctx);
  });
}

/**
 * Signed-in, and the role allows `permission`.
 *
 * A 403 is itself worth recording: "this account tried to reach something it
 * must not" is the single most useful line in an audit trail when privileges
 * are abused or misconfigured.
 */
export function permissionRoute<Ctx>(
  permission: Permission,
  handler: RouteHandler<Ctx>,
): RouteHandler<Ctx> {
  return withRequestPipeline(async (request, ctx) => {
    // Identity first, then the check: a denial has to name *who* was refused,
    // so the actor must already be resolved when the permission throws.
    const actor = await requireActor();

    try {
      requirePermission(actor, permission);
      assertPasswordReplaced(actor, request.nextUrl.pathname);
      return await handler(request, ctx);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        await recordAudit({
          action: AUDIT_ACTIONS.AUTHORIZATION_DENIED,
          entityType: "PERMISSION",
          entityId: permission,
          summary: `${actor.email} (${actor.role}) was denied "${permission}" on ${request.method} ${request.nextUrl.pathname}`,
          metadata: { permission, method: request.method, path: request.nextUrl.pathname },
        });
      }

      throw error;
    }
  });
}

/** Unauthenticated endpoint. Only for login and similar. */
export function publicRoute<Ctx>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return withRequestPipeline(handler);
}

/** Collects query params from a `URLSearchParams` into a plain object. */
export function searchParamsToObject(
  searchParams: URLSearchParams,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    result[key] = value;
  }
  return result;
}