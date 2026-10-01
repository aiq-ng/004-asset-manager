import { apiRoute, ok } from "@/lib/api";
import { requireActor, toActorDto } from "@/lib/auth/actor";
import { hasPassword } from "@/lib/services/auth";

/** The signed-in user, with the flags a UI needs to render its own controls. */
export const GET = apiRoute(async () => {
  const actor = await requireActor();

  return ok({
    ...toActorDto(actor),
    hasPassword: await hasPassword(actor.id),
  });
});