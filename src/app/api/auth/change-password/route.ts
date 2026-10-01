import { ok, parseJsonBody, parseOrThrow, apiRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import { changePassword } from "@/lib/services/auth";
import { changePasswordSchema } from "@/lib/validators/auth";

/** Self-service password change for the signed-in user. */
export const POST = apiRoute(async (request) => {
  const actor = await requireActor();
  const input = parseOrThrow(changePasswordSchema, await parseJsonBody(request));

  await changePassword(actor.id, input.currentPassword ?? "", input.newPassword);

  return ok({ id: actor.id, passwordUpdated: true });
});