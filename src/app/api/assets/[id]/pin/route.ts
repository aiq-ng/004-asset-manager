import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, parseJsonBody, parseOrThrow, permissionRoute } from "@/lib/api";
import { requireActor } from "@/lib/auth/actor";
import {
  clearDevicePin,
  generateAndSetDevicePin,
  revealDevicePin,
  setDevicePin,
} from "@/lib/services/asset-pins";
import { assetIdParamSchema, setDevicePinSchema } from "@/lib/validators/asset";

/**
 * Device PINs for one asset.
 *
 * The mirror of `../password/route.ts`, for the same reason that route exists:
 * the UI drives this through Server Actions, and these endpoints let a script —
 * an admin batch-enrolling a fleet from a terminal, or another internal tool
 * that cannot speak React — set and read the short numeric code too.
 *
 * `permissionRoute("asset:manage")` on every verb, ADMIN and up. The blanket
 * wrapper is the point: there is no read verb an anonymous or low-privileged
 * caller can reach, because `GET` returns a working credential and is exactly
 * the verb that must not be open by accident.
 */

/** The services take `IT-LAP-0001` or a cuid; the route parameter is always the cuid. */
const assetRefParamSchema = assetIdParamSchema.transform(({ id }) => id);

/**
 * `POST` body: exactly one of the two ways to end up with a stored PIN.
 *
 * A refinement rather than a union so the failure names the field. `generate`
 * alongside a `pin` is not an error: the flag wins, which makes "give me a fresh
 * one" safe to send from a client that also renders the manual field.
 */
const devicePinRequestSchema = z
  .object({
    generate: z.boolean().optional(),
    pin: setDevicePinSchema.shape.pin.optional(),
  })
  .refine((value) => value.generate === true || value.pin !== undefined, {
    message: "Provide either generate: true or a pin",
    path: ["pin"],
  });

/**
 * Reads the stored PIN.
 *
 * Deliberately returns only the plaintext. Whether one is set, and when and by
 * whom it was set, travel in the asset's own DTO (`devicePin`), so a client can
 * render "set by Ana in March" without this endpoint — which means a caller that
 * reaches this verb has genuinely wanted the secret, not the metadata.
 *
 * Audited inside the service, on every call including the failures.
 */
export const GET = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]/pin">) => {
    const id = parseOrThrow(assetRefParamSchema, await ctx.params);
    return ok({ pin: await revealDevicePin(id) });
  },
);

/**
 * Sets or regenerates the PIN.
 *
 * `{ "generate": true }` produces a fresh four-digit code and stores it;
 * `{ "pin": "1234" }` stores one the caller has already chosen. They are
 * mutually exclusive rather than both-optional, so a body that names neither is
 * a 400 instead of the pin field silently becoming null.
 *
 * Both return the plaintext that is now stored, so a client does not have to
 * make a second request — and a second request would be a second audited reveal.
 */
export const POST = permissionRoute("asset:manage",
  async (request: NextRequest, ctx: RouteContext<"/api/assets/[id]/pin">) => {
    const id = parseOrThrow(assetRefParamSchema, await ctx.params);
    const actor = await requireActor();
    const body = parseOrThrow(devicePinRequestSchema, await parseJsonBody(request));

    if (body.generate) {
      return ok(await generateAndSetDevicePin(id, actor));
    }

    // The refinement above guarantees one of the two branches was taken, so the
    // fallback is unreachable — and passing `""` rather than asserting is what
    // keeps that honest: if the refine were ever weakened, the service's own
    // format refusal becomes the error instead of a silent bad write.
    return ok(await setDevicePin(id, body.pin ?? "", actor));
  },
);

/** Forgets a stored PIN, for a device that no longer uses it. */
export const DELETE = permissionRoute("asset:manage",
  async (_request: NextRequest, ctx: RouteContext<"/api/assets/[id]/pin">) => {
    const id = parseOrThrow(assetRefParamSchema, await ctx.params);
    await clearDevicePin(id);
    return ok({ cleared: true });
  },
);
