import type { z } from "zod";

/**
 * The serialisable value every Server Action returns, plus the `FormData`
 * plumbing shared by the action modules.
 *
 * Deliberately *not* a `"use server"` module: a `"use server"` file may only
 * export async functions, and these are a type, a constant and synchronous
 * helpers. It is also deliberately **not** marked `server-only` — everything in
 * here is pure and needs to be importable from the Client Components that render
 * the forms, while the server-only modules (`define-action.ts`, `actions.ts`)
 * stay on the far side of the boundary.
 */

/**
 * State returned by every action.
 *
 * Not a discriminated union on purpose: `useActionState` hands this straight to
 * a form, which wants to read `state.error` and `state.fieldErrors` without
 * narrowing first. `ok` is still there for callers that need to branch.
 */
export interface ActionState<T = undefined> {
  ok: boolean;
  data?: T;
  message?: string;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

/** The state a form starts from: no error, nothing submitted yet. */
export const INITIAL_ACTION_STATE: ActionState<never> = { ok: false, error: "" };

/** Zod issues keyed by field name, ready to hand to `<Field error={...}>`. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }

  return fieldErrors;
}

/**
 * Flattens `FormData` into the plain object a Zod object schema expects.
 *
 * Repeated keys become arrays, which is how checkbox groups reach the schema.
 * `File` entries are dropped: they are handled by dedicated upload inputs, and
 * leaving them in would force every schema to be a union.
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;

    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else result[key] = [existing, value];
  }

  return result;
}