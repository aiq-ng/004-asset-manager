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

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  /** The raw token from the email link, carried as a hidden field. */
  token: z.string().trim().min(20, "reset token is missing").max(128),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(200),
  confirmPassword: z.string().min(1, "confirm the new password").max(200),
})
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;