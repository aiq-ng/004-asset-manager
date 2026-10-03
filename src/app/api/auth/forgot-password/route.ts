import { ok, parseJsonBody, parseOrThrow, publicRoute } from "@/lib/api";
import { requestPasswordReset } from "@/lib/services/auth";
import { forgotPasswordSchema } from "@/lib/validators/auth";

/**
 * "Forgot password": emails a single-use reset link when the account exists.
 *
 * The response is identical whether or not the address is registered, so the
 * endpoint cannot be used to enumerate accounts. The service decides silently.
 */
export const POST = publicRoute(async (request) => {
  const input = parseOrThrow(forgotPasswordSchema, await parseJsonBody(request));
  await requestPasswordReset(input.email);

  return ok({ message: "If an account exists for that email, a reset link is on its way." });
});
