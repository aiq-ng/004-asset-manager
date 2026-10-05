#!/usr/bin/env tsx
/**
 * Sets a new password for the SUPERADMIN.
 *
 * The companion to `create-superadmin`, and deliberately a separate script rather
 * than a flag on it. That script's contract is "create the one and only
 * SUPERADMIN, and refuse if one already exists" — the guard at the top is what
 * makes it safe to run twice. Resetting a password needs the opposite
 * precondition, so folding it in as `--change-password` would mean one file whose
 * behaviour, and whose safety guard, both hinge on a flag.
 *
 * This replaces the hand-written `set-password.sql` that sat in the repo root:
 * a checked-in SQL file holding one fixed scrypt hash cannot express "whatever
 * password the operator types now", and it is easy to run the wrong one.
 *
 *   pnpm auth:set-superadmin-password
 *
 * ## It does not ask for the current password
 *
 * That is a deliberate trade, not an oversight. Requiring the old password would
 * make the script unusable for its most likely occasion — locked out, or the
 * password has been lost rather than leaked. The trust boundary is therefore the
 * database, which is where it already sits: creating the superadmin in the first
 * place needs no session either, via `/setup` or `create-superadmin`, so anyone
 * with write access to the database can already take the account outright.
 * Verifying a password here would add a prompt without moving that boundary,
 * while making recovery impossible.
 *
 * The interactive path asks for the password twice, because the realistic failure
 * is a typo, and a typo silently locks the single account that can fix it.
 *
 * ## Sessions are revoked
 *
 * `sessionVersion` is incremented, matching `changePassword`, `resetPassword` and
 * the staff update service. Session cookies are stateless and stay valid until
 * they expire, so without this a stolen cookie would outlive the password that
 * was supposed to have locked the intruder out — which would defeat the entire
 * point of resetting a password you believe leaked.
 *
 * `mustChangePassword` is cleared too: this is the operator's own password for
 * the account, not a temporary one handed out by an invite.
 *
 * Non-interactive, for CI or `docker exec`:
 *   SUPERADMIN_PASSWORD=... pnpm auth:set-superadmin-password
 * or pass --password. Prefer the interactive prompt where there is a TTY — a
 * password on the command line lands in shell history and in `ps` output, which
 * any user on the machine can read.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { password as promptPassword } from "@inquirer/prompts";
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
  const superadmin = await prisma.staff.findFirst({
    where: { role: StaffRole.SUPERADMIN },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      sessionVersion: true,
    },
  });

  if (!superadmin) {
    console.error("There is no superadmin to reset. Run `pnpm auth:create-superadmin` first.");
    process.exit(1);
  }

  console.log(
    `Resetting the password for ${superadmin.name} <${superadmin.email}> ` +
      `(SUPERADMIN, session version ${superadmin.sessionVersion}).`,
  );

  if (!superadmin.passwordHash) {
    console.log("This account has never had a password, so it cannot currently sign in.");
  }

  const provided = flag("password") ?? process.env.SUPERADMIN_PASSWORD;
  const interactive = provided === undefined;

  const validate = (value: string) =>
    value.length >= MIN_PASSWORD_LENGTH ? true : `use at least ${MIN_PASSWORD_LENGTH} characters`;

  const secret =
    provided ??
    (await promptPassword({ message: `new password (min ${MIN_PASSWORD_LENGTH} characters)`, validate }));

  if (interactive) {
    // Confirmed by re-entry rather than a yes/no prompt, so the two values are
    // actually compared instead of merely the operator's confidence in them.
    const confirmation = await promptPassword({ message: "confirm the new password" });
    if (confirmation !== secret) {
      console.error("The two passwords did not match. Nothing was changed.");
      process.exit(1);
    }
  }

  if (secret.length < MIN_PASSWORD_LENGTH) {
    console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    process.exit(1);
  }

  await prisma.staff.update({
    where: { id: superadmin.id },
    data: {
      passwordHash: await hashPassword(secret),
      // Revokes every cookie already issued to this account, so a session opened
      // with the old password stops working immediately rather than at expiry.
      sessionVersion: { increment: 1 },
      // The password is the operator's own, not an invite's temporary one, so the
      // forced-change gate lifts with it.
      mustChangePassword: false,
    },
  });

  console.log(
    `\nDone. ${superadmin.email} can sign in with the new password, and all of its ` +
      `outstanding sessions have been revoked.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Failed to set the superadmin password:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
