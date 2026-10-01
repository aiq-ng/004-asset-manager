import { ok, parseJsonBody, parseOrThrow, publicRoute } from "@/lib/api";
import { login } from "@/lib/services/auth";
import { loginSchema } from "@/lib/validators/auth";

export const POST = publicRoute(async (request) => {
  const input = parseOrThrow(loginSchema, await parseJsonBody(request));

  return ok(await login(input.email, input.password));
});