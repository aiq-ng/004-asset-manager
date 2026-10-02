#!/usr/bin/env tsx
/**
 * Creates the one and only SUPERADMIN.
 *
 * There is no API route for this on purpose: SUPERADMIN can never be granted
 * through the app, so a stolen admin token cannot promote anybody. Run it once
 * against a fresh (or already populated) database:
 *
 *   pnpm auth:create-superadmin
 *
 * If staff already exist it promotes the oldest account instead of creating a
 * new one, which keeps "the first user is the superadmin" true for databases
 * that were seeded or populated by hand. It refuses to run when a superadmin is
 * already present.
 *
 * Non-interactive form, for CI or `docker exec`:
 *   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... pnpm auth:create-superadmin
 * or pass --name / --email / --password.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { input, password } from "@inquirer/prompts";
import { config } from "dotenv";

import { PrismaClient, StaffRole } from "../src/generated/prisma/client";
import { MIN_PASSWORD_LENGTH, hashPassword } from "../src/lib/auth/password";

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set (put it in .env or export it)");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/** `--flag value` or `--flag=value`, so the script can run without a TTY. */
function flag(name: string): string | undefined {
  const withEquals = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (withEquals) return withEquals.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const existingSuperadmin = await prisma.staff.findFirst({
    where: { role: StaffRole.SUPERADMIN },
    select: { email: true },
  });

  if (existingSuperadmin) {
    console.error(`A superadmin already exists (${existingSuperadmin.email}). Nothing to do.`);
    process.exit(1);
  }

  const oldest = await prisma.staff.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { name: true, email: true, role: true },
  });

  if (oldest) {
    console.log(
      `Staff already exist, so the oldest account becomes the superadmin: ` +
        `${oldest.name} <${oldest.email}> (currently ${oldest.role}).`,
    );
  }

  const interactive = !flag("password") && !process.env.SUPERADMIN_PASSWORD;

  const name =
    flag("name") ??
    process.env.SUPERADMIN_NAME ??
    (interactive
      ? await input({
          message: "name",
          default: oldest?.name,
          validate: (value: string) => (value.trim() ? true : "name is required"),
        })
      : oldest?.name);

  const email =
    flag("email") ??
    process.env.SUPERADMIN_EMAIL ??
    (interactive
      ? await input({
          message: "email",
          default: oldest?.email,
          validate: (value: string) =>
            /.+@.+\..+/.test(value.trim()) ? true : "enter a valid email address",
        })
      : undefined);

  if (!email?.trim()) {
    console.error("An email address is required (--email or SUPERADMIN_EMAIL)");
    process.exit(1);
  }

  if (!name?.trim()) {
    console.error("A name is required (--name or SUPERADMIN_NAME)");
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

  const data = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: StaffRole.SUPERADMIN,
    passwordHash: await hashPassword(secret),
  };

  if (oldest) {
    await prisma.staff.update({ where: { email: oldest.email }, data });
  } else {
    // Creating from scratch means the register has no departments yet, so there is
    // nothing to point the account at. The first department is created here rather
    // than assumed: inventing an "Unassigned" bucket would let a real department
    // be misspelled later and nobody would notice, because the bucket would
    // always be there to fall back into.
    const department = await prisma.department.upsert({
      where: { name: "IT" },
      update: {},
      create: { name: "IT" },
    });

    await prisma.staff.create({ data: { ...data, departmentId: department.id } });
  }

  console.log(`\nDone. ${data.email} is now the superadmin and can sign in via POST /api/auth/login.`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to create the superadmin:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });