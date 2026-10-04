"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { z } from "zod";

import { getActor } from "@/lib/auth/actor";
import { clientIpFrom, recordAudit, runWithRequestContext } from "@/lib/audit/context";
import { ApiError } from "@/lib/errors";
import { defineAction } from "@/lib/server/define-action";
import {
  changePassword as changePasswordService,
  login as loginWithPassword,
  logout as logoutService,
  requestPasswordReset,
  resetPassword,
} from "@/lib/services/auth";
import { bootstrapSuperadmin } from "@/lib/services/staff-bootstrap";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/lib/validators/auth";
import { bootstrapSuperadminSchema } from "@/lib/validators/staff";
import {
  formDataToObject,
  submittedValues,
  toFieldErrors,
  type ActionState,
} from "@/lib/server/action-state";

/**
 * Sign-in and sign-out — the `"use server"` boundary the login form imports.
 *
 * These cannot use `defineAction`: login runs with no session and both need the
 * client address, which matters most for login because a failed attempt is
 * exactly the event worth recording.
 *
 * `login()` and `logout()` own the session cookie themselves (they delegate to
 * `lib/auth/session.ts`), so these actions must not touch the cookie store too.
 */

export async function loginAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  const parsed = loginSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: toFieldErrors(parsed.error), values: submittedValues(formData) };
  }

  try {
    await runWithRequestContext(await auditContext("action:login", null), () =>
      loginWithPassword(parsed.data.email, parsed.data.password),
    );
  } catch (error) {
    // A Next.js control-flow error is re-thrown untouched rather than reported
    // as a failed sign-in. `redirect()` below is outside this catch, but anything
    // reached from here that interrupts the render has to survive it too.
    unstable_rethrow(error);

    if (error instanceof ApiError) {
      return {
        ok: false,
        error: error.message,
        code: error.code,
        // Echoed here as well as on the validation branch: a wrong password is
        // the common failure, not a rare one, and it must not cost the address
        // it was mistyped against.
        values: submittedValues(formData),
      };
    }

    console.error("[action] login failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // `redirect()` signals through a thrown control-flow error, so it has to stay
  // outside the catch above — otherwise it would be swallowed as a failure.
  redirect(safeNextPath(formData.get("next")));
}

/**
 * Only same-origin absolute paths are honoured. A leading `//` is
 * protocol-relative (`//evil.example`), so a crafted `?next=` cannot bounce a
 * freshly signed-in user to another origin.
 */
function safeNextPath(candidate: FormDataEntryValue | null): string {
  if (typeof candidate !== "string") return "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  return candidate;
}

/**
 * "Forgot password" — always succeeds with the same wording, whether or not the
 * address is registered. Revealing nothing is the point; the service does the
 * silent skip, this action just never contradicts it.
 */
export async function forgotPasswordAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: toFieldErrors(parsed.error), values: submittedValues(formData) };
  }

  try {
    await runWithRequestContext(await auditContext("action:forgot-password", null), () =>
      requestPasswordReset(parsed.data.email),
    );
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ApiError) {
      return { ok: false, error: error.message, code: error.code, values: submittedValues(formData) };
    }

    console.error("[action] forgot password failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return {
    ok: true,
    error: "",
    message: "If an account exists for that email, a reset link is on its way. Check your inbox.",
  };
}

/**
 * The forced password change for invited accounts.
 *
 * Same schema as the settings action (with confirmation), but on success it
 * navigates to the app root instead of back to settings: the session that just
 * cleared its `mustChangePassword` flag wants to land somewhere useful, not on
 * the form it was bounced from. `changePassword` re-issues the session cookie.
 */
const forceChangePasswordSchema = changePasswordSchema
  .extend({
    confirmPassword: z.string().min(1, "confirm your new password").max(200),
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match",
  });

export const forceChangePasswordAction = defineAction(
  forceChangePasswordSchema,
  (input, actor) => changePasswordService(actor.id, input.currentPassword ?? "", input.newPassword),
  {
    route: "action:forceChangePassword",
    successMessage: "Password updated.",
    redirect: () => "/",
  },
);

/** Consumes the token from the email link and sets the new password. */
export async function resetPasswordAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: toFieldErrors(parsed.error), values: submittedValues(formData) };
  }

  try {
    await runWithRequestContext(await auditContext("action:reset-password", null), () =>
      resetPassword(parsed.data.token, parsed.data.newPassword),
    );
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ApiError) {
      return { ok: false, error: error.message, code: error.code };
    }

    console.error("[action] reset password failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  return { ok: true, error: "", message: "Your password has been updated. Sign in with the new one." };
}

export async function logoutAction(): Promise<void> {
  const actor = await getActor();

  if (actor) {
    // Bumps `sessionVersion`, which revokes cookies already issued — deleting the
    // cookie alone would leave a stateless token valid until it expired.
    await runWithRequestContext(await auditContext("action:logout", actor), () =>
      logoutService(actor.id, actor.email),
    );
  }

  redirect("/login");
}

/**
 * Creates the SUPERADMIN on a fresh install, from the app's own setup screen.
 *
 * Cannot use `defineAction`, for the same reason `loginAction` cannot: there is
 * no actor yet — nobody has ever signed in — so the factory's permission check
 * and actor lookup have nothing to work from. That is not a hole to guard here
 * but the definition of the endpoint: it is reachable *only* while the database
 * holds no superadmin, and the moment one exists the service refuses it.
 *
 * The redirect matters as much as the write. Landing on /login with the account
 * now able to authenticate is the honest end of the flow; staying put would
 * leave a setup form in front of somebody whose superadmin already exists.
 */
export async function bootstrapSuperadminAction(
  _previousState: ActionState<undefined>,
  formData: FormData,
): Promise<ActionState<undefined>> {
  const parsed = bootstrapSuperadminSchema.safeParse(formDataToObject(formData));

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please correct the highlighted fields.",
      fieldErrors: toFieldErrors(parsed.error),
      values: submittedValues(formData),
    };
  }

  // `confirmPassword` is only ever a comparison, never a column: dropping it
  // here means the value the operator typed to confirm cannot be forwarded by
  // accident, and keeps the object handed to the service to exactly the fields it
  // is shaped for.
  const { confirmPassword, ...input } = parsed.data;
  void confirmPassword;

  try {
    // `recordAudit` is injected rather than called from inside the service
    // because the bootstrap service has to stay importable from plain `tsx`
    // (the CLI runs there, and `server-only` throws). Passing the recorder here
    // is also what makes the row land on the audit trail: `recordAudit` reads
    // the actor, address and route from the context this call publishes.
    await runWithRequestContext(await auditContext("action:bootstrapSuperadmin", null), () =>
      bootstrapSuperadmin(input, { record: recordAudit }),
    );
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof ApiError) {
      return {
        ok: false,
        error: error.message,
        code: error.code,
        values: submittedValues(formData),
      };
    }

    console.error("[action] bootstrap superadmin failed", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // Outside the catch: `redirect()` signals by throwing, and a catch that
  // swallows it would report a successful setup as a failure.
  redirect("/login");
}

async function auditContext(route: string, actor: Awaited<ReturnType<typeof getActor>>) {
  const requestHeaders = await headers();

  return {
    actor,
    ipAddress: clientIpFrom(new Request("http://localhost/", { headers: requestHeaders })),
    userAgent: requestHeaders.get("user-agent"),
    route,
  };
}