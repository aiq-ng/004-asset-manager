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
  /**
   * The submitted text fields, echoed back when the action fails.
   *
   * React empties an uncontrolled form once its Server Action returns, whether
   * or not it succeeded, so without this a validation message arrives having
   * cost the person everything they typed. Feeding a field back as its
   * `defaultValue` puts it back on the next render.
   *
   * First value wins for a repeated key, so an array field never becomes a
   * string here; those forms hold their own state.
   */
  values?: Record<string, string>;
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
 * Field names whose value is never echoed back, however the field is spelled.
 *
 * A secret in `state.values` is a secret in the RSC payload, which means it is
 * in the response body, in anything that logs one, and in the rendered markup of
 * the page — for a form that is supposed to be holding nothing but a name and an
 * address. Matching on the name rather than listing fields means a new
 * `confirmNewPassword` is covered by the same rule as the one it confirms.
 */
const SECRET_KEY = /pass|secret|token|credential/i;

/**
 * The string entries of a submission, for echoing back into a failed form.
 *
 * Files are dropped, secrets are dropped, and only the first value of a repeated
 * key is kept: this is for repopulating text fields, not for replaying a
 * submission.
 */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (SECRET_KEY.test(key)) continue;
    if (values[key] === undefined) values[key] = value;
  }

  return values;
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