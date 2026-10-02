import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, StaffRole } from "../src/generated/prisma/client";
import { reserveAssetId } from "../src/lib/services/asset-id";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const assetTypes = [
  { name: "Laptop", code: "LAP" },
  { name: "Printer", code: "PRN" },
  { name: "Router", code: "RTR" },
  { name: "Monitor", code: "MON" },
];

// Departments are their own rows, seeded before staff because every staff member
// points at one. Keeping the names here — rather than inline on each person — is
// what stops the seed from reintroducing a department that nobody added on
// purpose.
const departments = ["IT", "Finance", "Operations"];

// No passwords: seeded accounts exist to exercise the roles, not to be signed
// in with. `pnpm auth:create-superadmin` promotes the oldest row (Ana) to
// SUPERADMIN and sets her password; the superadmin can then hand out roles.
const staff: {
  name: string;
  department: string;
  email: string;
  phone: string | null;
  role: StaffRole;
}[] = [
  {
    name: "Ana Ribeiro",
    department: "IT",
    email: "ana.ribeiro@example.com",
    phone: "+351 912 000 111",
    role: StaffRole.ASSIGNER,
  },
  {
    name: "Bruno Costa",
    department: "Finance",
    email: "bruno.costa@example.com",
    phone: null,
    role: StaffRole.USER,
  },
  {
    name: "Carla Dias",
    department: "Operations",
    email: "carla.dias@example.com",
    phone: "+351 933 222 333",
    role: StaffRole.USER,
  },
];

// Serial numbers are omitted on purpose: bulk items rarely have one and an
// empty string must not collide on the unique constraint.
const assets = [
  { code: "LAP", description: "MacBook Pro 14\" M3", unit: 1, serialNumber: "SN-LAP-0001" },
  { code: "LAP", description: "Dell Latitude 5440", unit: 1, serialNumber: "SN-LAP-0002" },
  { code: "LAP", description: "ThinkPad T14 (spare pool)", unit: 1, serialNumber: null },
  { code: "PRN", description: "HP LaserJet M404dn", unit: 1, serialNumber: "SN-PRN-0001" },
  { code: "MON", description: "Dell U2422H 24\" monitor", unit: 6, serialNumber: null },
  { code: "RTR", description: "UniFi Dream Machine", unit: 1, serialNumber: null },
];

async function main() {
  console.log("Seeding asset types...");
  const types = new Map<string, { id: string; code: string }>();

  for (const type of assetTypes) {
    const record = await prisma.assetType.upsert({
      where: { code: type.code },
      update: { name: type.name },
      create: type,
    });
    types.set(record.code, { id: record.id, code: record.code });
  }

  console.log("Seeding departments...");
  const departmentIds = new Map<string, string>();
  for (const name of departments) {
    const record = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    departmentIds.set(name, record.id);
  }

  console.log("Seeding staff...");
  const staffIds = new Map<string, string>();
  for (const member of staff) {
    // The name has to exist as a department row: the FK is RESTRICT, so a typo
    // here would abort the seed rather than quietly create a new department.
    const departmentId = departmentIds.get(member.department);
    if (!departmentId) {
      throw new Error(`Seed references unknown department "${member.department}"`);
    }

    const record = await prisma.staff.upsert({
      where: { email: member.email },
      // role is left alone on re-seed so the superadmin promotion survives it.
      update: { name: member.name, departmentId, phone: member.phone },
      // Fields are listed rather than spread from `member`: the name is a label
      // that was only ever resolved to an id above, and passing the string along
      // as well would fail typecheck against the relation.
      create: {
        name: member.name,
        email: member.email,
        phone: member.phone,
        role: member.role,
        departmentId,
        passwordHash: null,
      },
    });
    staffIds.set(record.email, record.id);
  }

  // Collected rather than thrown immediately: each asset seeds in its own
  // transaction, so one bad row does not hold back the rest. An operator gets the
  // whole list of conflicts in a single run instead of fixing them one per attempt.
  const conflicts: string[] = [];

  console.log("Seeding assets...");
  for (const asset of assets) {
    const type = types.get(asset.code);
    if (!type) throw new Error(`Unknown asset type code: ${asset.code}`);

    // Seeded assets are matched on their type plus their description. Both come
    // straight from the table above, so the pair is the same on every run, and it
    // is what makes re-seeding safe: there is no other unique key to hand
    // `upsert`, and `serialNumber` cannot be one because most of these items
    // deliberately have none — a null column is not a lookup key in Postgres.
    const existing = await prisma.asset.findFirst({
      where: { assetTypeId: type.id, description: asset.description },
      orderBy: { assetId: "asc" },
      select: { id: true, assetId: true },
    });

    if (existing) {
      // Converges the fields the seed owns, and only those. `assetId` is left
      // alone because it was drawn from a counter that must not skip a value, and
      // `status` because it reflects assignments an operator may have made since —
      // restoring either would quietly undo real work. The trade-off is that an
      // asset somebody created with exactly this description and type is treated
      // as the seeded one, which is the cost of not having a dedicated seed key.
      await prisma.asset.update({
        where: { id: existing.id },
        data: { unit: asset.unit, serialNumber: asset.serialNumber },
      });
      console.log(`  ${existing.assetId} already seeded (${asset.description})`);
      continue;
    }

    // Same ID generation path as POST /api/assets, so counters stay in sync.
    // Only reached when the row is genuinely absent, so the counter only advances
    // for assets that are actually added.
    try {
      const { assetId } = await prisma.$transaction(async (tx) => {
        const assetId = await reserveAssetId(tx, type.id, type.code);

        await tx.asset.create({
          data: {
            assetId,
            assetTypeId: type.id,
            description: asset.description,
            unit: asset.unit,
            serialNumber: asset.serialNumber,
          },
        });

        return { assetId };
      });

      console.log(`  created ${assetId} (${asset.description})`);
    } catch (error) {
      // The transaction rolls back, so the counter is untouched and a rerun starts
      // from the same place. What is left is a real collision: some other asset
      // already holds the serial number this one wants. Adopting that asset's
      // serial — or renaming it to match the seed — would rewrite somebody else's
      // data to satisfy a demo script, so this stops and says what happened.
      if ((error as { code?: string }).code === "P2002" && asset.serialNumber) {
        const holder = await prisma.asset.findUnique({
          where: { serialNumber: asset.serialNumber },
          select: { assetId: true, description: true },
        });

        conflicts.push(
          `"${asset.description}" wants serial number ${asset.serialNumber}, already held by ` +
            `${holder ? `${holder.assetId} ("${holder.description}")` : "another asset"}`,
        );
        continue;
      }

      throw error;
    }
  }

  if (conflicts.length > 0) {
    // Every asset above is either seeded or already converged; these are the ones
    // that could not be. Non-zero exit, because the database is not in the state
    // this script was asked to put it in.
    console.error(
      `\nSeeded with ${conflicts.length} conflict(s):\n` +
        conflicts.map((line) => `  - ${line}`).join("\n") +
        "\n\nRe-seeding is meant to converge a database this seed created. Against one that has" +
        "\ndrifted, clear or correct the serial numbers above first, or run on a fresh database.",
    );
    process.exitCode = 1;
  }

  console.log("Seeding assignments...");
  const firstLaptop = await prisma.asset.findFirst({
    where: { assetId: { startsWith: "IT-LAP-" } },
    orderBy: { assetId: "asc" },
  });
  const ana = staffIds.get("ana.ribeiro@example.com");

  if (firstLaptop && ana) {
    const existing = await prisma.assignment.findUnique({
      where: { id: "seed-assignment" },
      select: { id: true },
    });

    await prisma.assignment.upsert({
      where: { id: "seed-assignment" },
      update: {},
      create: {
        id: "seed-assignment",
        assetId: firstLaptop.id,
        staffId: ana,
        note: "Issued with the onboarding kit",
      },
    });

    // Claimed on first creation only. The upsert above leaves an existing
    // assignment exactly as it is, so setting the status again on every run would
    // resurrect a laptop that has since been returned — the row would say
    // returned while the asset said held.
    if (!existing) {
      await prisma.asset.update({
        where: { id: firstLaptop.id },
        data: { status: "ASSIGNED" },
      });
    }
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });