#!/usr/bin/env tsx
/**
 * Clears everything `pnpm db:seed` can put back, keeping the superadmin.
 *
 * For working on the seed itself, or for getting out of a database that has
 * drifted from it. It is *not* a migration tool and it is *not* reversible: the
 * rows it removes are gone, and the only way to get them back is to re-seed.
 *
 * ## The superadmin survives, and nothing else does
 *
 * `Staff_one_superadmin` guarantees exactly one, and it is the one account this
 * script must not touch: it is the only way back into a database it has just
 * emptied, because every other account is deleted. It is preserved by id rather
 * than by role so that a role change made through the UI can never turn a
 * re-seed into a lockout. Its department row is kept for the same reason — the
 * FK is RESTRICT, and repointing it would silently move the account.
 *
 * ## Order, and why it is this order
 *
 * `Assignment` holds RESTRICT foreign keys to both `Asset` and `Staff`, so
 * assignments go first or nothing else can be deleted. `AuditLog` is truncated
 * rather than deleted: it has a `BEFORE DELETE` trigger that raises, on purpose,
 * because the trail is append-only (see the `audit_log` migration). Truncate is
 * unaffected by row triggers, and the migration leaves it as the sanctioned
 * escape hatch for exactly this. Doing it first also matters — deleting staff
 * rewrites `AuditLog.actorId` to NULL through `ON DELETE SET NULL`, and doing
 * that while the rows still exist would fire the update trigger instead.
 *
 *   pnpm db:reset -- --yes
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { confirm } from "@inquirer/prompts";
import { config } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not set (put it in .env or export it)");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const superadmin = await prisma.staff.findFirst({
    where: { role: "SUPERADMIN" },
    select: { id: true, email: true, name: true, departmentId: true },
  });

  if (!superadmin) {
    // Nothing to keep, so this would be `prisma migrate reset` territory rather
    // than a data reset. Saying so stops the obvious mistake of running it,
    // finding the app gated at /setup, and not understanding why.
    console.error(
      "There is no superadmin, so there is nothing to preserve.\n" +
        "Create one first (the app's /setup screen, or pnpm auth:create-superadmin),\n" +
        "otherwise you will lock yourself out of the database you are about to empty.",
    );
    process.exit(1);
  }

  const before = {
    staff: await prisma.staff.count(),
    assets: await prisma.asset.count(),
    assignments: await prisma.assignment.count(),
    assetTypes: await prisma.assetType.count(),
    departments: await prisma.department.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.log("\nThis will permanently delete:");
  console.log(`  staff          ${before.staff}  (keeping ${superadmin.email})`);
  console.log(`  assets         ${before.assets}`);
  console.log(`  assignments    ${before.assignments}`);
  console.log(`  asset types    ${before.assetTypes}`);
  console.log(`  departments    ${before.departments}  (keeping the one ${superadmin.email} belongs to)`);
  console.log(`  audit log      ${before.auditLogs}`);
  console.log("\nIt cannot be undone. Re-run pnpm db:seed afterwards.\n");

  const skipPrompt = process.argv.includes("--yes") || process.argv.includes("-y");

  if (!skipPrompt) {
    const proceed = await confirm({ message: "Clear this data?", default: false });
    if (!proceed) {
      console.log("Nothing was changed.");
      return;
    }
  }

  // Truncate outside the transaction below: it takes an ACCESS EXCLUSIVE lock
  // that would otherwise be held for the whole clear, and a rollback is not
  // something this operation meaningfully supports anyway.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog"');

  const removed = await prisma.$transaction(async (tx) => {
    const assignments = await tx.assignment.deleteMany({});
    const tokens = await tx.passwordResetToken.deleteMany({});
    const assets = await tx.asset.deleteMany({});
    // Deletes the Counter rows with it (ON DELETE CASCADE), so asset ids are
    // renumbered from the first one again — which is what makes a fresh seed
    // produce the same IT-LAP-0001 it always did.
    const assetTypes = await tx.assetType.deleteMany({});
    const staff = await tx.staff.deleteMany({ where: { NOT: { id: superadmin.id } } });
    const departments = await tx.department.deleteMany({
      where: { NOT: { id: superadmin.departmentId } },
    });

    return {
      staff: staff.count,
      assets: assets.count,
      assignments: assignments.count,
      assetTypes: assetTypes.count,
      departments: departments.count,
      resetTokens: tokens.count,
    };
  });

  console.log(`\nCleared ${removed.staff} staff, ${removed.assets} assets, `
    + `${removed.assignments} assignments, ${removed.assetTypes} asset types, `
    + `${removed.departments} departments, ${before.auditLogs} audit rows.`);
  console.log(`Kept ${superadmin.email} (${superadmin.name}).`);
  console.log("\nNext: pnpm db:seed");
}

main()
  .catch((error: unknown) => {
    console.error("Reset failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });