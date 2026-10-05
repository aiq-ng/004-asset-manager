#!/usr/bin/env tsx
/**
 * Creates the one and only SUPERADMIN, from a shell.
 *
 * The app's `/setup` screen does the same thing in a browser and is the route a
 * human is expected to take. This exists for the cases a browser cannot cover:
 * a container being provisioned with no UI, CI, or an install whose only
 * operator has shell access. It is not a second, weaker path — it calls the same
 * service the setup screen does, so both are held to the same rules.
 *
 * There is no API route for this on purpose: SUPERADMIN can never be granted
 * through the staff API, so a stolen admin token cannot promote anybody.
 *
 *   pnpm auth:create-superadmin
 *
 * ## It never modifies an existing account
 *
 * Earlier versions promoted the oldest staff row when the database already had
 * staff, on the reasoning that "the first user is the superadmin" should stay
 * true for seeded databases. That was wrong, and dangerous: it silently
 * elevated a real person's account *and overwrote their password*, so running
 * the bootstrap against a populated database was account takeover of whoever
 * happened to be created first. It now only ever inserts. If the email you
 * supply already belongs to somebody, it says so and stops.
 *
 * "Exactly one superadmin" is enforced by a partial unique index
 * (`Staff_one_superadmin`), which is what makes two simultaneous runs — or this
 * script racing the setup screen — impossible rather than merely unlikely.
 *
 * Non-interactive form, for CI or `docker exec`:
 *   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... pnpm auth:create-superadmin
 * or pass --name / --email / --password.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { input, password } from "@inquirer/prompts";
import { config } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import { MIN_PASSWORD_LENGTH } from "../src/lib/auth/password-policy";
import { bootstrapSuperadmin } from "../src/lib/services/staff-bootstrap";

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set (put it in .env or export it)");
  process.exit(1);
}

// Built here rather than imported from `lib/prisma`, which validates the whole
// environment — `APP_URL`, `MINIO_*`, `SESSION_SECRET` — on construction. This
// script needs a database and nothing else, and it is most useful on exactly the
// machines where the rest is not configured yet. `prisma/seed.ts` does the same.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/** `--flag value` or `--flag=value`, so the script can run without a TTY. */
function flag(name: string): string | undefined {
  const withEquals = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (withEquals) return withEquals.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const superadmin = await prisma.staff.findFirst({
    where: { role: "SUPERADMIN" },
    select: { email: true },
  });

  if (superadmin) {
    console.error(
      `A superadmin already exists (${superadmin.email}).\n` +
        `To change its password, run: pnpm auth:set-superadmin-password`,
    );
    process.exit(1);
  }

  const interactive = !flag("password") && !process.env.SUPERADMIN_PASSWORD;

  const name =
    flag("name") ??
    process.env.SUPERADMIN_NAME ??
    (interactive
      ? await input({
          message: "name",
          validate: (value: string) => (value.trim() ? true : "name is required"),
        })
      : undefined);

  const email =
    flag("email") ??
    process.env.SUPERADMIN_EMAIL ??
    (interactive
      ? await input({
          message: "email",
          validate: (value: string) =>
            /.+@.+\..+/.test(value.trim()) ? true : "enter a valid email address",
        })
      : undefined);

  if (!name?.trim()) {
    console.error("A name is required (--name or SUPERADMIN_NAME)");
    process.exit(1);
  }

  if (!email?.trim()) {
    console.error("An email address is required (--email or SUPERADMIN_EMAIL)");
    process.exit(1);
  }

  const normalisedEmail = email.trim().toLowerCase();

  // Checked before the prompt, so somebody is not asked to choose a password for
  // an address that cannot be used. The service refuses the same thing; this
  // exists so the failure is a sentence rather than a constraint violation.
  const clash = await prisma.staff.findUnique({
    where: { email: normalisedEmail },
    select: { email: true, role: true },
  });

  if (clash) {
    console.error(
      `${normalisedEmail} already belongs to a staff account (${clash.role}).\n` +
        `This script only creates new accounts — it will not change an existing one.\n` +
        `To set a superadmin password, run: pnpm auth:set-superadmin-password`,
    );
    process.exit(1);
  }

  const providedPassword = flag("password") ?? process.env.SUPERADMIN_PASSWORD;
  const secret =
    providedPassword ??
    (await password({
      message: `password (min ${MIN_PASSWORD_LENGTH} characters)`,
      validate: (value: string) =>
        value.length >= MIN_PASSWORD_LENGTH ? true : `use at least ${MIN_PASSWORD_LENGTH} characters`,
    }));

  if (secret.length < MIN_PASSWORD_LENGTH) {
    console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    process.exit(1);
  }

  const created = await bootstrapSuperadmin(
    {
      name: name.trim(),
      email: normalisedEmail,
      password: secret,
    },
    // This script's own client, so it stays runnable on a machine that has only
    // a database — see the `client` option on `bootstrapSuperadmin`.
    //
    // No `record`: the audit publisher is a no-op outside a request anyway, and
    // the recorder lives behind `server-only`, which throws under plain tsx.
    { client: prisma },
  );

  console.log(`\nDone. ${created.email} is now the superadmin and can sign in via POST /api/auth/login.`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to create the superadmin:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
