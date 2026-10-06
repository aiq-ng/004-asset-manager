-- The device password moves from AES-256-GCM ciphertext to plaintext storage.
--
-- The rename preserves any already-stored values: the column keeps its data, it
-- just loses the `v1$iv$tag$ct` encoding, which nothing reads any more. Rows
-- saved while encryption was live decrypt to their original password under the
-- rename — the base64url ciphertext happens to be a perfectly valid (if ugly)
-- plaintext, so if you have rows from the encrypted era, reset those passwords
-- once rather than expecting them to read back as they were.

ALTER TABLE "Asset" RENAME COLUMN "passwordCiphertext" TO "password";