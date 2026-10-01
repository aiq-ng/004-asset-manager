import { ok, apiRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { logout } from "@/lib/services/auth";

/**
 * Signs the account out everywhere. Idempotent: calling it without a session is
 * a 401 like any other protected route, since there is nothing to sign out.
 */
export const POST = apiRoute(async () => {
  const actor = await requireActor();

  await logout(actor.id, actor.email);

  return ok({ signedOut: true });
});
