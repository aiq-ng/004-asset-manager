import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import {
  clearDevicePassword,
  generateAndSetDevicePassword,
  revealDevicePassword,
  setDevicePassword,
} from "@/lib/services/asset-passwords";
import { assetIdParamSchema, setDevicePasswordSchema } from "@/lib/validators/asset";

/**
 * Device passwords for one asset.
 *
 * The UI drives this through Server Actions (`features/assets/actions.ts`); these
 * endpoints exist so the credential is reachable from a script — the case that
 * matters here is an admin batch-updating a fleet from a terminal, or another
 * internal tool that cannot speak React.
 *
 * `permissionRoute("asset:manage")` on every verb, ADMIN and up. The blanket
 * wrapper is the point: there is no read verb an anonymous or low-privileged
 * caller can reach, because `GET` returns a working credential and is exactly the
 * verb that must not be open by accident.
 */

/** The services take `IT-LAP-0001` or a cuid; the route parameter is always the cuid. */
const assetRefParamSchema = assetIdParamSchema.transform(({ id }) => id);

/**
 * `POST` body: exactly one of the two ways to end up with a stored password.
 *
 * A refinement rather than a union so the failure names the field. `generate`
 * alongside a `password` is not an error: the flag wins, which makes "give me a
 * fresh one" safe to send from a client that also renders the manual field.
 */
const devicePasswordRequestSchema = z
  .object({
    generate: z.boolean().optional(),
    password: setDevicePasswordSchema.shape.password.optional(),
  })
  .refine((value) => value.generate === true || value.password !== undefined, {
    message: "Provide either generate: true or a password",
    path: ["password"],
  });

/**
 * Reads the stored password.
 *
 * Deliberately returns only the plaintext. Whether one is set, and when and by
 * whom it was set, travel in the asset's own DTO (`devicePassword`), so a client
 * can render "set by Ana in March" without this endpoint — which means a caller
 * that reaches this verb has genuinely wanted the secret, not the metadata.
 *
 * Audited inside the service, on every call including the failures.
 */
export const GET = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]/password">) => {
    const id = parseOrThrow(assetRefParamSchema, await ctx.params);
    return ok({ password: await revealDevicePassword(id) });
  },
);

/**
 * Sets or regenerates the password.
 *
 * `{ "generate": true }` produces a fresh readable code and stores it;
 * `{ "password": "..." }` stores one the caller has already chosen. They are
 * mutually exclusive rather than both-optional, so a body that names neither is a
 * 400 instead of the password field silently becoming null.
 *
 * Both return the plaintext that is now stored, so a client does not have to
 * make a second request — and a second request would be a second audited reveal.
 */
export const POST = permissionRoute("asset:manage",
  async (request: NextRequest, ctx: RouteContext<"/api/assets/[id]/password">) => {
    const id = parseOrThrow(assetRefParamSchema, await ctx.params);
    const actor = await requireActor();
    const body = parseOrThrow(devicePasswordRequestSchema, await parseJsonBody(request));

    if (body.generate) {
      return ok(await generateAndSetDevicePassword(id, actor));
    }


    // The refinement above guarantees one of the two branches was taken, so the
    // fallback is unreachable — and passing `""` rather than asserting is what
    // keeps it that way honest: if the refine were ever weakened, the service's
    // own empty-value refusal becomes the error instead of a silent null write.
    // Both service paths return `{ password, status }`, so the two branches share
    // one response shape.
    return ok(await setDevicePassword(id, body.password ?? "", actor));
  },
);

/** Forgets a stored password, for a device that no longer uses it. */
export const DELETE = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]/password">) => {
    const id = parseOrThrow(assetRefParamSchema, await ctx.params);
    await clearDevicePassword(id);
    return ok({ cleared: true });
  },
);