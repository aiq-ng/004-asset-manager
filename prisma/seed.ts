import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, StaffRole, type Prisma } from "../src/generated/prisma/client";
import { reserveAssetId } from "../src/lib/services/asset-id";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env first.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Demo data for local work. Every value below is chosen to exercise something
 * the app actually does, because a seed that only fills the happy path leaves
 * the awkward screens untested until somebody trips over them in earnest.
 *
 * What this deliberately covers:
 *  - all three assignable roles, so the permission matrix has something to say
 *  - every `AssetStatus`, including UNDER_REPAIR and RETIRED, which are almost
 *    never the state of a freshly created asset
 *  - assignments both open and returned, with `assignedBy`/`returnedBy` filled
 *    in — the columns the audit trail and the assignment history read, and the
 *    two that older seed data left null
 *  - dates spread over the past two months, because "Assigned 2 hours ago" and
 *    "Assigned 3 days ago" format differently and only one of them is common
 */

/** Days ago, as a Date. Keeps the relative timestamps plausible on any run. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const assetTypes = [
  { name: "Laptop", code: "LAP" },
  { name: "Monitor", code: "MON" },
  { name: "Printer", code: "PRN" },
  { name: "Router", code: "RTR" },
  { name: "Headset", code: "HDS" },
  { name: "Tablet", code: "TBL" },
];

// Departments are their own rows, seeded before staff because every staff member
// points at one. Keeping the names here — rather than inline on each person — is
// what stops the seed from reintroducing a department that nobody added on
// purpose. `Facilities` exists to give an asset owner somewhere to sit that is
// not IT; without it every seeded asset belongs to the same team, which hides
// the cross-department cases.
const departments = ["IT", "Finance", "Operations", "Editors", "Facilities"];

/**
 * No passwords: seeded accounts exist to exercise the roles, not to be signed
 * in with, and `passwordHash: NULL` is what locks them out of login by design.
 * None of them is a superadmin — the bootstrap creates a separate account
 * rather than elevating one of these, so re-seeding never disturbs the
 * superadmin's credentials. Use `/setup`, or `pnpm auth:create-superadmin`, to
 * create it; the superadmin can then hand out roles.
 */
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
  {
    name: "Diogo Ferreira",
    department: "IT",
    email: "diogo.ferreira@example.com",
    phone: "+351 966 444 555",
    role: StaffRole.ADMIN,
  },
  {
    name: "Eva Nunes",
    department: "Finance",
    email: "eva.nunes@example.com",
    phone: null,
    role: StaffRole.ASSIGNER,
  },
  {
    name: "Hugo Martins",
    department: "Operations",
    email: "hugo.martins@example.com",
    phone: "+351 910 555 666",
    role: StaffRole.USER,
  },
  {
    name: "Inês Rocha",
    department: "Editors",
    email: "ines.rocha@example.com",
    phone: null,
    role: StaffRole.ADMIN,
  },
  {
    name: "Rui Santos",
    department: "Facilities",
    email: "rui.santos@example.com",
    phone: "+351 927 777 888",
    role: StaffRole.USER,
  },
];

type SeedAsset = {
  code: string;
  description: string;
  /** Optional; "" and whitespace are stored as NULL. */
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  /** Only for assets that are not in stock. `AVAILABLE` is the default. */
  status?: "AVAILABLE" | "UNDER_REPAIR" | "RETIRED";
};

/**
 * Every item carries a brand and a serial, because registration demands both:
 * a seed row the app itself could not have created is a fixture that quietly
 * contradicts the form it is supposed to be demonstrating.
 */
const assets: SeedAsset[] = [
  { code: "LAP", brand: "Apple", model: "MacBook Pro 14\" M3", description: '14-inch developer laptop', serialNumber: "SN-LAP-0001" },
  { code: "LAP", brand: "Dell", model: "Latitude 5440", description: "Business laptop", serialNumber: "SN-LAP-0002" },
  { code: "LAP", brand: "Lenovo", model: "ThinkPad T14", description: "Spare pool laptop", serialNumber: "SN-LAP-0003" },
  { code: "LAP", brand: "Apple", model: "MacBook Air 13\" M2", description: "Travel laptop", serialNumber: "SN-LAP-0004" },
  {
    code: "LAP",
    brand: "HP",
    model: "EliteBook 840 G8",
    description: "Elitebook",
    serialNumber: "SN-LAP-0005",
    status: "UNDER_REPAIR",
  },
  { code: "MON", brand: "Dell", model: "UltraSharp U2422H", description: '24" monitor', serialNumber: "SN-MON-0001" },
  { code: "MON", brand: "LG", model: "27UP850", description: '27" 4K monitor', serialNumber: "SN-MON-0002" },
  { code: "MON", brand: "Samsung", model: "Odyssey G5", description: '32" curved monitor', serialNumber: "SN-MON-0003" },
  { code: "PRN", brand: "HP", model: "LaserJet Pro M404dn", description: "Office laser printer", serialNumber: "SN-PRN-0001" },
  { code: "PRN", brand: "Epson", model: "EcoTank ET-2850", description: "Colour ink tank printer", serialNumber: "SN-PRN-0002" },
  {
    code: "PRN",
    brand: "Brother",
    model: "HL-L2350DW",
    description: "Mono laser printer",
    serialNumber: "SN-PRN-0003",
    status: "RETIRED",
  },
  { code: "RTR", brand: "Ubiquiti", model: "UniFi Dream Machine", description: "All-in-one gateway", serialNumber: "SN-RTR-0001" },
  { code: "RTR", brand: "TP-Link", model: "TL-WA2600X", description: "Wi-Fi 6 access point", serialNumber: "SN-RTR-0002" },
  { code: "HDS", brand: "Jabra", model: "Evolve2 65", description: "Wireless headset", serialNumber: "SN-HDS-0001" },
  { code: "TBL", brand: "Apple", model: "iPad 10th gen", description: 'Tablet with Wi-Fi', serialNumber: "SN-TBL-0001" },
];

/**
 * Assignment history.
 *
 * `assignedBy`/`returnedBy` are the columns that make the assignment table and
 * the audit trail say *who* did it. They are filled in here because a seed that
 * left them null made the handover column permanently blank — which looked like
 * a rendering bug rather than missing data.
 *
 * An entry with no `returnedOn` is an open assignment, and the asset's status is
 * left to `ASSIGNED` by the code below. Everything else is a completed handover,
 * including one returned with damage and one returned in good order, because the
 * return sheet asks for a condition note and a seed that never had one meant
 * that column was never exercised.
 */
type SeedAssignment = {
  id: string;
  assetDescription: string;
  staffEmail: string;
  assignedByEmail: string;
  returnedByEmail?: string;
  assignedDaysAgo: number;
  returnedDaysAgo?: number;
  note?: string;
  returnNote?: string;
};

const assignments: SeedAssignment[] = [
  {
    id: "seed-assignment-open-laptop",
    assetDescription: "14-inch developer laptop",
    staffEmail: "ana.ribeiro@example.com",
    assignedByEmail: "diogo.ferreira@example.com",
    assignedDaysAgo: 45,
    note: "Issued with the onboarding kit",
  },
  {
    id: "seed-assignment-open-printer",
    assetDescription: "Office laser printer",
    staffEmail: "carla.dias@example.com",
    assignedByEmail: "ana.ribeiro@example.com",
    assignedDaysAgo: 12,
    note: "Shared printer for the Operations floor",
  },
  {
    id: "seed-assignment-open-router",
    assetDescription: "All-in-one gateway",
    staffEmail: "hugo.martins@example.com",
    assignedByEmail: "diogo.ferreira@example.com",
    assignedDaysAgo: 3,
    note: "Spare router while the office one was replaced",
  },
  {
    id: "seed-assignment-open-headset",
    assetDescription: "Wireless headset",
    staffEmail: "eva.nunes@example.com",
    assignedByEmail: "diogo.ferreira@example.com",
    assignedDaysAgo: 1,
  },
  {
    id: "seed-assignment-returned-laptop",
    assetDescription: "Business laptop",
    staffEmail: "bruno.costa@example.com",
    assignedByEmail: "diogo.ferreira@example.com",
    returnedByEmail: "diogo.ferreira@example.com",
    assignedDaysAgo: 40,
    returnedDaysAgo: 20,
    note: "Finance close period, needed a machine",
    returnNote: "Back in good order",
  },
  {
    id: "seed-assignment-returned-monitor",
    assetDescription: '24" monitor',
    staffEmail: "carla.dias@example.com",
    assignedByEmail: "ana.ribeiro@example.com",
    returnedByEmail: "diogo.ferreira@example.com",
    assignedDaysAgo: 26,
    returnedDaysAgo: 5,
    note: "Temporary second screen during the move",
    returnNote: "Scuffs on the stand, screen is fine",
  },
  {
    id: "seed-assignment-returned-headset",
    assetDescription: "Wireless headset",
    staffEmail: "rui.santos@example.com",
    assignedByEmail: "diogo.ferreira@example.com",
    returnedByEmail: "ana.ribeiro@example.com",
    assignedDaysAgo: 30,
    returnedDaysAgo: 9,
    returnNote: "Left pad flaking, sent back to the supplier",
  },
  {
    id: "seed-assignment-returned-tablet",
    assetDescription: "Tablet with Wi-Fi",
    staffEmail: "ines.rocha@example.com",
    assignedByEmail: "diogo.ferreira@example.com",
    returnedByEmail: "ana.ribeiro@example.com",
    assignedDaysAgo: 15,
    returnedDaysAgo: 2,
    note: "For the field shoot",
    returnNote: "Back in good order",
  },
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
      // role is left alone on re-seed so a role change made through the UI — or
      // the superadmin promotion, which the CLI and /setup perform — survives.
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
  /** Description → id, so the assignments below can find what was just created. */
  const assetIdsByDescription = new Map<string, string>();

  for (const asset of assets) {
    const type = types.get(asset.code);
    if (!type) throw new Error(`Unknown asset type code: ${asset.code}`);

    // Seeded assets are matched on their type plus their description. Both come
    // straight from the table above, so the pair is the same on every run, and it
    // is what makes re-seeding safe: there is no other unique key to hand
    // `upsert`, and the serial is not used as one because a re-seed that reused
    // a serial from a retired row would fight the unique constraint.
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
        data: { brand: asset.brand, model: asset.model, serialNumber: asset.serialNumber },
      });
      assetIdsByDescription.set(asset.description, existing.id);
      console.log(`  ${existing.assetId} already seeded (${asset.description})`);
      continue;
    }

    // Same ID generation path as POST /api/assets, so counters stay in sync.
    // Only reached when the row is genuinely absent, so the counter only advances
    // for assets that are actually added.
    try {
      const { assetId, id } = await prisma.$transaction(async (tx) => {
        const assetId = await reserveAssetId(tx, type.id, type.code);

        const created = await tx.asset.create({
          data: {
            assetId,
            assetTypeId: type.id,
            description: asset.description,
            brand: asset.brand,
            model: asset.model,
            serialNumber: asset.serialNumber,
            // UNDER_REPAIR and RETIRED are set here rather than left as the
            // AVAILABLE default, so a fresh database has the states an operator
            // spends real time in.
            status: asset.status ?? "AVAILABLE",
          },
          select: { id: true, assetId: true },
        });

        return created;
      });

      assetIdsByDescription.set(asset.description, id);
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

  console.log("Seeding assignments...");
  for (const entry of assignments) {
    const assetId = assetIdsByDescription.get(entry.assetDescription);
    const staffId = staffIds.get(entry.staffEmail);
    const assignedById = staffIds.get(entry.assignedByEmail);
    const returnedById = entry.returnedByEmail ? staffIds.get(entry.returnedByEmail) : undefined;

    // Resolved before the write so a typo in this table is an error message
    // rather than an assignment pointing at nobody.
    for (const [label, value] of [
      ["asset", assetId],
      ["staff", staffId],
      ["assignedBy", assignedById],
      ["returnedBy", entry.returnedByEmail ? returnedById : true],
    ] as const) {
      if (!value) {
        throw new Error(
          `Assignment ${entry.id} references an unknown ${label}: ` +
            `${entry.assetDescription} / ${entry.staffEmail} / ${entry.assignedByEmail} / ` +
            `${entry.returnedByEmail ?? "—"}`,
        );
      }
    }

    const data: Prisma.AssignmentUncheckedCreateInput = {
      id: entry.id,
      assetId: assetId!,
      staffId: staffId!,
      assignedById: assignedById!,
      returnedById: returnedById ?? null,
      dateAssigned: daysAgo(entry.assignedDaysAgo),
      dateReturned: entry.returnedDaysAgo ? daysAgo(entry.returnedDaysAgo) : null,
      note: entry.note ?? null,
      returnNote: entry.returnNote ?? null,
    };

    const existing = await prisma.assignment.findUnique({
      where: { id: entry.id },
      select: { id: true },
    });

    await prisma.assignment.upsert({
      where: { id: entry.id },
      // Converged rather than left alone, unlike assets: an assignment is pure
      // history with no operator edits behind it, so re-seeding should make it
      // look the same as it did the first time.
      update: data,
      create: data,
    });

    // Only on creation. Setting the status on every run would reopen an
    // assignment somebody returned — the row would say returned while the asset
    // said held, which is exactly the contradiction the serializers work to
    // avoid.
    if (!existing && !entry.returnedDaysAgo) {
      await prisma.asset.update({ where: { id: assetId! }, data: { status: "ASSIGNED" } });
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