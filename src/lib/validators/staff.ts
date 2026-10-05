import { z } from "zod";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { optionalTrimmedString, paginationSchema } from "@/lib/validators/common";

/**
 * Every role the backend can hold. The list filter matches on all of them;
 * `assignableRoleSchema` is the narrower set a superadmin may hand out.
 */
export const STAFF_ROLES = ["USER", "ASSIGNER", "ADMIN", "SUPERADMIN"] as const;

/**
 * Roles a superadmin may hand out. SUPERADMIN is absent on purpose: it is only
 * ever granted by the setup screen or `pnpm auth:create-superadmin`, never
 * through staff management.
 */
export const assignableRoleSchema = z.enum(["USER", "ASSIGNER", "ADMIN"]);

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200, "password must be <= 200 characters");

export const listStaffQuerySchema = paginationSchema.extend({
  /**
   * Every role, not just the assignable ones. `SUPERADMIN` is excluded from
   * `assignableRoleSchema` because it must never be handed out, but those
   * accounts do appear in the register, so the list filter has to match them —
   * otherwise selecting one leaves the results unchanged and looks broken.
   */
  role: z.enum(STAFF_ROLES).optional(),
  q: z
    .string()
    .trim()
    .min(1, "q must not be empty")
    .max(120, "q must be <= 120 characters")
    .optional(),
  /**
   * A department id rather than a name. The form picks from the list maintained
   * in /departments, so the value is always one the database already knows about
   * and the free-text spellings of a department cannot reappear.
   */
  departmentId: z.string().trim().min(1).max(64).optional(),
});

export const createStaffSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(120, "name must be <= 120 characters"),
  departmentId: z
    .string()
    .trim()
    .min(1, "department is required")
    .max(64, "department must be <= 64 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("email must be a valid email address")
    .max(200, "email must be <= 200 characters"),
  phone: optionalTrimmedString.optional(),
  role: assignableRoleSchema.default("USER"),
  /** Omit to create a locked account that cannot sign in yet. */
  password: passwordSchema.optional(),
});

export const updateStaffSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(120, "name must be <= 120 characters")
      .optional(),
    departmentId: z
      .string()
      .trim()
      .min(1, "department is required")
      .max(64, "department must be <= 64 characters")
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("email must be a valid email address")
      .max(200, "email must be <= 200 characters")
      .optional(),
    phone: optionalTrimmedString.optional(),
    role: assignableRoleSchema.optional(),
    /** Set or reset the account password. */
    password: passwordSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one of: name, department, email, phone, role, password",
  });

export const staffIdParamSchema = z.object({
  id: z.string().trim().min(1, "Staff id is required").max(64),
});

/**
 * The one-time setup form.
 *
 * The confirmation is the field worth justifying: this is the only moment
 * anybody ever sets a password they are certain of, with nobody checking it for
 * them, and the person who then has to be able to sign in is whoever just
 * created the install. A typo that is accepted here leaves an app that nobody
 * can get into, with no second superadmin to fix it — the unique index that
 * makes a *second* one impossible is the same thing that makes recovery from a
 * bad first password impossible.
 *
 * `password` and `confirmPassword` are compared after trimming neither: a
 * leading space is a legitimate part of a passphrase, and silently stripping it
 * from one field but not the other would reject matches the operator can see
 * are identical.
 */
export const bootstrapSuperadminSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(120, "name must be <= 120 characters"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("enter a valid email address")
      .max(200, "email must be <= 200 characters"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "confirm your password").max(200),
  })
  .refine((value) => value.confirmPassword === value.password, {
    path: ["confirmPassword"],
    message: "the two passwords do not match",
  });

export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
export type AssignableRole = z.infer<typeof assignableRoleSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type BootstrapSuperadminInput = z.infer<typeof bootstrapSuperadminSchema>;