import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const email = z
  .string()
  .trim()
  .min(1, "email is required")
  .max(255)
  .email("email must be a valid address");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "password is required").max(200),
});

/**
 * `currentPassword` may be omitted only for an account that has never had a
 * password; the service enforces that.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;