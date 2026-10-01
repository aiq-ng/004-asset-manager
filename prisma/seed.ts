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

  console.log("Seeding staff...");
  const staffIds = new Map<string, string>();
  for (const member of staff) {
    const record = await prisma.staff.upsert({
      where: { email: member.email },
      // role is left alone on re-seed so the superadmin promotion survives it.
      update: { name: member.name, department: member.department, phone: member.phone },
      create: { ...member, passwordHash: null },
    });
    staffIds.set(record.email, record.id);
  }

  console.log("Seeding assets...");
  for (const asset of assets) {
    const type = types.get(asset.code);
    if (!type) throw new Error(`Unknown asset type code: ${asset.code}`);

    // Same ID generation path as POST /api/assets, so counters stay in sync.
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
  }

  console.log("Seeding assignments...");
  const firstLaptop = await prisma.asset.findFirst({
    where: { assetId: { startsWith: "IT-LAP-" } },
    orderBy: { assetId: "asc" },
  });
  const ana = staffIds.get("ana.ribeiro@example.com");

  if (firstLaptop && ana) {
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
    await prisma.asset.update({
      where: { id: firstLaptop.id },
      data: { status: "ASSIGNED" },
    });
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