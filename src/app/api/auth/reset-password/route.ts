import { ok, parseJsonBody, parseOrThrow, publicRoute } from "@/lib/api";
import { resetPassword } from "@/lib/services/auth";
import { resetPasswordSchema } from "@/lib/validators/auth";

/**
 * Consumes a single-use reset token and sets the new password.
 *
 * Invalid, used and expired tokens all fail with the same message from the
 * service, so the error cannot distinguish which case happened.
 */
export const POST = publicRoute(async (request) => {
  const input = parseOrThrow(resetPasswordSchema, await parseJsonBody(request));
  await resetPassword(input.token, input.newPassword);

  return ok({ message: "Password updated. You can now sign in with your new password." });
});
