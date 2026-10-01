import { z } from "zod";

export const createAssetTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(80, "name must be <= 80 characters"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}$/, "code must be 2-4 uppercase letters, e.g. LAP"),
});

export const updateAssetTypeSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(80, "name must be <= 80 characters")
      .optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,4}$/, "code must be 2-4 uppercase letters, e.g. LAP")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one of: name, code",
  });

export type CreateAssetTypeInput = z.infer<typeof createAssetTypeSchema>;
export type UpdateAssetTypeInput = z.infer<typeof updateAssetTypeSchema>;