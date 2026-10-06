-- The device PIN, alongside the device password: the short numeric code a device
-- is unlocked with, stored with the same tradeoffs and the same compensating
-- controls (never in a DTO, read only through services/asset-pins.ts, every read
-- and write audited).
--
-- Written by hand rather than generated so the timestamp lands after
-- 20261006130000_asset_password_plaintext; wall-clock generation at the time this
-- was added would have produced an earlier name and filed the migration before
-- the rename it does not depend on.

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "pin" TEXT,
ADD COLUMN     "pinSetAt" TIMESTAMP(3),
ADD COLUMN     "pinSetById" TEXT;

-- AlterTable
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_pinSetById_fkey" FOREIGN KEY ("pinSetById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
