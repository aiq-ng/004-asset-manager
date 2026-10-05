import { z } from "zod";

/**
 * Validates every environment variable the backend needs. Imported by
 * `lib/prisma.ts` and `lib/storage.ts`, so the app fails fast at boot with a
 * single, readable message instead of an obscure runtime error later on.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  APP_URL: z
    .string()
    .min(1, "APP_URL is required")
    .url("APP_URL must be an absolute URL, e.g. http://localhost:3000")
    .transform((value) => value.replace(/\/+$/, "")),

  MINIO_ENDPOINT: z
    .string()
    .min(1, "MINIO_ENDPOINT is required")
    .url("MINIO_ENDPOINT must be an absolute URL, e.g. http://localhost:9000")
    .transform((value) => value.replace(/\/+$/, "")),
  MINIO_PUBLIC_ENDPOINT: z
    .string()
    .transform((value) => value.trim())
    .transform((value) => (value === "" ? null : value.replace(/\/+$/, "")))
    .nullable()
    .default(null),
  MINIO_ACCESS_KEY: z.string().min(1, "MINIO_ACCESS_KEY is required"),
  MINIO_SECRET_KEY: z.string().min(1, "MINIO_SECRET_KEY is required"),
  MINIO_BUCKET: z.string().min(1, "MINIO_BUCKET is required").default("asset-images"),
  MINIO_PRESIGN_EXPIRY_SECONDS: z.coerce
    .number()
    .int("MINIO_PRESIGN_EXPIRY_SECONDS must be an integer")
    .positive("MINIO_PRESIGN_EXPIRY_SECONDS must be greater than 0")
    .default(3600),

  // Redis backs the audit queue. It defaults so the API still boots without it:
  // a missing Redis degrades auditing, it does not break the inventory API.
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .default("redis://localhost:6379"),
  // Optional namespace so several environments can share one Redis without
  // colliding on queue keys. Leave empty for none.
  AUDIT_REDIS_PREFIX: z
    .string()
    .transform((value) => value.trim())
    .default(""),

  // HS256 signing key for the session cookie. Generate with:
  //   openssl rand -base64 32
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (openssl rand -base64 32)"),

  // Transactional email (Resend). Optional on purpose: with no key the mailer
  // degrades to logging what it would have sent, so the app still boots and the
  // invite/reset flows stay testable locally.
  RESEND_API_KEY: z.string().trim().default(""),
  // Resend requires a verified sender. `onboarding@resend.dev` works for local
  // testing only; set your own verified domain in production.
  EMAIL_FROM: z
    .string()
    .trim()
    .min(1)
    .default("Inventory Control <onboarding@resend.dev>"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables -> ${details}`);
  }

  cached = parsed.data;
  return cached;
}