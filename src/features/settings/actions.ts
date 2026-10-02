"use server";

import { z } from "zod";

import { defineAction } from "@/lib/server/define-action";
import { changePassword } from "@/lib/services/auth";
import { changePasswordSchema } from "@/lib/validators/auth";

/**
 * The API schema plus a confirmation field.
 *
 * `changePasswordSchema` is deliberately not `.strict()`, so an unknown
 * `confirmPassword` would be silently stripped and a typo in the second field
 * would go unnoticed. Extending it here — rather than changing the shared
 * validator — keeps the REST contract untouched while still making the form
 * honest about what the user typed.
 */
const settingsChangePasswordSchema = changePasswordSchema
  .extend({
    confirmPassword: z.string().min(1, "confirm your new password").max(200),
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ["confirmPassword"],
    message: "The two passwords do not match",
  });

/**
 * Self-service password change.
 *
 * `changePassword` re-issues the caller's own session cookie after a successful
 * change, so the action redirects rather than refreshing — otherwise the page
 * would keep rendering against the superseded cookie until the next navigation.
 *
 * No `permission` is set on purpose: changing your own password is not a
 * privilege, it is available to every signed-in account. The service still
 * requires the current password unless the account has never had one.
 */
export const changePasswordAction = defineAction(
  settingsChangePasswordSchema,
  (input, actor) => changePassword(actor.id, input.currentPassword ?? "", input.newPassword),
  {
    route: "action:changePassword",
    successMessage: "Password updated.",
    redirect: () => "/settings",
  },
);