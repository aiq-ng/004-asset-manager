import "server-only";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ZodType } from "zod";
import { z } from "zod";

import { getActor } from "@/lib/auth/actor";
import type { Actor, Permission } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/permissions";
import { clientIpFrom, runWithRequestContext } from "@/lib/audit/context";
// Without this the Server Action bundle keeps the no-op publisher and every
// action taken through the UI goes unrecorded, while `recordAudit` reports
// success. See `lib/audit/install.ts`.
import "@/lib/audit/install";
import { ApiError } from "@/lib/errors";
import {
  formDataToObject,
  submittedValues,
  toFieldErrors,
  type ActionState,
} from "@/lib/server/action-state";

/**
 * The single seam between the UI and the service layer.
 *
 * Route handlers go through `lib/api.ts`, which publishes an audit context and
 * turns thrown `ApiError`s into HTTP responses. A Server Action has neither a
 * `Request` nor a response to shape, so this provides the equivalent:
 *
 *  - the actor is resolved — and optionally permission-checked — before the
 *    handler runs, so an action can never forget to authorise itself;
 *  - an audit context is published for the duration of the call, so services keep
 *    calling `recordAudit()` without taking actor/IP/route as arguments;
 *  - `FormData` is validated with the *same* Zod schemas the REST routes use, so
 *    the two entry points cannot drift;
 *  - failures come back as serialisable state rather than a thrown error, which
 *    is what `useActionState` needs in order to re-render with field errors.
 *
 * This module is deliberately **not** a `"use server"` module: it exports a
 * factory, not actions. The per-feature `actions.ts` files are the `"use server"`
 * boundary that client components import.
 */

interface FieldErrorDetail {
  path: string;
  message: string;
}

function isFieldErrorDetails(details: unknown): details is FieldErrorDetail[] {
  return (
    Array.isArray(details) &&
    details.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as FieldErrorDetail).path === "string" &&
        typeof (entry as FieldErrorDetail).message === "string",
    )
  );
}

/**
 * Normalises a thrown value into a renderable failure state.
 *
 * `unstable_rethrow` runs first because Next.js interrupts the render with thrown
 * errors rather than return values: `redirect()` inside a Server Action throws
 * `NEXT_REDIRECT`, and swallowing it here would turn a successful mutation into
 * "Something went wrong" on a page whose redirect had already been decided. The
 * same applies to `notFound()` and `forbidden()`. Any error Next recognises is
 * re-thrown untouched; only genuine failures are converted.
 *
 * Pass the `FormData` where there is one. React empties an uncontrolled form
 * once its Server Action returns, whether or not it succeeded, so a failure that
 * does not echo the submission costs the person everything they typed — and the
 * service-level refusals (a duplicate serial, a file that is not an image) are
 * exactly the ones people hit twice.
 */
export function toFailure(error: unknown, formData?: FormData): ActionState<never> {
  unstable_rethrow(error);
  const values = formData ? submittedValues(formData) : undefined;

  if (error instanceof ApiError) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      ...(isFieldErrorDetails(error.details)
        ? { fieldErrors: toFieldErrorsOf(error.details) }
        : {}),
      ...(values ? { values } : {}),
    };
  }

  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(error),
      ...(values ? { values } : {}),
    };
  }

  // Never leak an unexpected message to the browser, but do log it server-side.
  console.error("[action] unhandled error", error);
  return { ok: false, error: "Something went wrong. Please try again.", ...(values ? { values } : {}) };
}

function toFieldErrorsOf(details: FieldErrorDetail[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const detail of details) fieldErrors[detail.path] ??= detail.message;
  return fieldErrors;
}

/**
 * Best-effort audit context for a Server Action, which has no `Request` of its own.
 *
 * Exported for the hand-written actions that cannot go through `defineAction`
 * (the image upload needs the raw `File` out of the `FormData`, which the
 * schema-parsing path drops), so they publish the same context shape.
 */
export async function actionRequestContext(route: string, actor: Actor | null) {
  const requestHeaders = await headers();

  return {
    actor,
    ipAddress: clientIpFrom(new Request("http://localhost/", { headers: requestHeaders })),
    userAgent: requestHeaders.get("user-agent"),
    route,
  };
}

export interface ActionOptions<TOutput = unknown> {
  /**
   * Label recorded as the audit `route`, e.g. `"action:createAsset"`. A Server
   * Action has no HTTP path of its own, so without this an audit row could not
   * say what triggered it.
   */
  route: string;
  /** Required permission. Omit for actions any signed-in user may perform. */
  permission?: Permission;
  /** Set `false` for sign-in style actions that run before a session exists. */
  requiresActor?: boolean;
  /** Success message surfaced to the caller, e.g. as a toast. */
  successMessage?: string;
  /**
   * Re-render the current route after a successful mutation.
   *
   * Every read in this app goes straight to the database with no `use cache`, so
   * there are no cache entries to invalidate — `refresh()` reruns the dynamic
   * work and the router picks up the new data. Defaults to `true`; set `false`
   * for actions whose result the caller navigates away from anyway.
   */
  revalidate?: boolean;
  /**
   * Navigate after a successful mutation, e.g. to the record just created.
   *
   * Runs *instead of* `refresh()`: `redirect()` throws to unwind the render, so
   * the two together would leave the refresh half-done. Failing actions never
   * redirect, which is what lets a form re-render with its field errors.
   */
  redirect?: (data: TOutput) => string;
}

/**
 * Builds a `useActionState`-compatible Server Action.
 *
 * The returned function keeps the `(previousState, formData)` signature React
 * expects and returns the same shape on success and failure, so a form can render
 * `state.fieldErrors` without a try/catch of its own.
 */
export function defineAction<TInput, TOutput = undefined>(
  schema: ZodType<TInput>,
  handler: (input: TInput, actor: Actor) => Promise<TOutput> | TOutput,
  options: ActionOptions<TOutput>,
): (previousState: ActionState<TOutput>, formData: FormData) => Promise<ActionState<TOutput>> {
  const requiresActor = options.requiresActor ?? true;

  return async function action(
    previousState: ActionState<TOutput>,
    formData: FormData,
  ): Promise<ActionState<TOutput>> {
    let actor: Actor | null = null;

    try {
      if (requiresActor) {
        actor = await getActor();
        if (!actor) throw ApiError.unauthenticated("Your session has expired. Please sign in again.");
        if (options.permission) requirePermission(actor, options.permission);
      }

      const input = schema.parse(formDataToObject(formData));
      const data = await runWithRequestContext(await actionRequestContext(options.route, actor), () =>
        handler(input, actor as Actor),
      );

      // `redirect()` throws to unwind the render, so it replaces the refresh
      // rather than following it.
      if (options.redirect) redirect(options.redirect(data));

      if (options.revalidate ?? true) refresh();

      return { ok: true, data, error: "", message: options.successMessage };
    } catch (error) {
      // Echoing the submission back is what lets a form put the person's typing
      // back after React empties it. Only on the way out through a failure: a
      // successful action either redirects or replaces the page.
      return { ...previousState, ...toFailure(error), values: submittedValues(formData) };
    }
  };
}

/**
 * Reads a validated query object out of a page's `searchParams`.
 *
 * Invalid values fall back to the schema defaults rather than throwing: a
 * hand-edited URL should still render a page, just unfiltered.
 */
export function parseQuery<TSchema extends ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fallback = schema.safeParse({});
  if (fallback.success) return fallback.data;

  throw ApiError.badRequest("Invalid query parameters", result.error.issues);
}