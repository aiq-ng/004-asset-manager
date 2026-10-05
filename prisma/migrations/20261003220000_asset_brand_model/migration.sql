-- Add `Asset.model`, and an index on `brand` for the filter dropdown.
--
-- `brand` already existed but nothing could act on it: the assets search covered
-- assetId, serialNumber and description only, so typing "Dell" found nothing,
-- and `createAsset` folded the brand into the description as
-- "Latitude 5440 (Dell)", storing it twice over. `model` on its own would have
-- inherited the same problem, so this adds the column and the index that make
-- both fields real.
--
-- NULL, not "": plenty of asset types have no meaningful brand (a shelf, a
-- cable), and an empty string is not a lookup key in Postgres. Matches
-- `serialNumber`.
ALTER TABLE "Asset" ADD COLUMN "model" TEXT;

CREATE INDEX "Asset_brand_idx" ON "Asset" ("brand");
