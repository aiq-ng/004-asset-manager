"use server";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { getActor } from "@/lib/auth/actor";
import { clientIpFrom, runWithRequestContext } from "@/lib/audit/context";
import { ApiError } from "@/lib/errors";
import { login as loginWithPassword, logout as logoutService } from "@/lib/services/auth";
import { loginSchema } from "@/lib/validators/auth";
import { formDataToObject, toFieldErrors, type ActionState } from "@/lib/server/action-state";

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
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: toFieldErrors(parsed.error) };
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
      return { ok: false, error: error.message, code: error.code };
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

async function auditContext(route: string, actor: Awaited<ReturnType<typeof getActor>>) {
  const requestHeaders = await headers();

  return {
    actor,
    ipAddress: clientIpFrom(new Request("http://localhost/", { headers: requestHeaders })),
    userAgent: requestHeaders.get("user-agent"),
    route,
  };
}