-- Departments become a real relation instead of free text on Staff.
--
-- The migration is written out by hand rather than generated, because the
-- interesting part is the backfill and Prisma cannot express it: it only sees
-- "add a required column", not "populate it from the values already there".
-- Generated against a live table it would also fail on the NOT NULL.

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- Backfill: one department per distinct value already in use.
--
-- GROUP BY lower(trim(...)) is what collapses "IT", "it" and " IT " into a single
-- department; left alone they would become three rows that look identical to
-- whoever picks from the new list.
--
-- The name is MIN(trim(...)) rather than the lowercased key, because the
-- grouping must ignore case while the display value must not: it would turn IT
-- into "it" and Finance into "finance", and a register that cannot spell its own
-- department names is not a register anybody trusts. MIN picks one spelling
-- deterministically when a group genuinely has more than one.
INSERT INTO "Department" ("id", "name")
SELECT md5(LOWER(BTRIM("department"))) AS "id", MIN(BTRIM("department")) AS "name"
FROM "Staff"
WHERE BTRIM("department") <> ''
GROUP BY LOWER(BTRIM("department"));

-- AlterTable: add the column as nullable, backfill from the name match, then
-- enforce NOT NULL. Doing it in that order means no row is ever briefly invalid.
ALTER TABLE "Staff" ADD COLUMN "departmentId" TEXT;

-- The join is case-insensitive on purpose: the stored name keeps its original
-- capitalisation, so matching it exactly would drop staff whose spelling differed
-- from the one MIN happened to pick.
UPDATE "Staff" AS s
SET "departmentId" = d."id"
FROM "Department" AS d
WHERE LOWER(BTRIM(s."department")) = LOWER(d."name");

-- Any row whose department was empty or whitespace-only has no department to
-- point at. Rather than inventing one and silently filing people somewhere they
-- do not work, fail loudly: somebody has to decide what these rows are.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Staff" WHERE "departmentId" IS NULL) THEN
        RAISE EXCEPTION
            'Cannot migrate: % Staff row(s) have an empty department. Assign them a department first.',
            (SELECT COUNT(*) FROM "Staff" WHERE "departmentId" IS NULL);
    END IF;
END $$;

ALTER TABLE "Staff" ALTER COLUMN "departmentId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Staff_departmentId_idx" ON "Staff"("departmentId");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The old column has served its purpose. Dropping it is what makes the
-- relationship real rather than advisory — otherwise a stale string could still
-- be written next to a contradicting foreign key.
ALTER TABLE "Staff" DROP COLUMN "department";