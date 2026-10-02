import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Password hashing with node's built-in scrypt, so there is no native module to
 * compile. The encoded form is self-describing:
 *
 *   scrypt$<keylen>$<salt base64url>$<hash base64url>
 *
 * Parameters live in the string, so raising the cost later still verifies old
 * hashes. Use `needsRehash` to upgrade them on the next successful login.
 */
const ALGORITHM = "scrypt";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const CURRENT_COST = { keylen: KEY_LENGTH, saltLength: SALT_LENGTH };

// Re-exported so server-side callers have one obvious import; the value itself
// lives in a module with no Node builtins, so client forms can use it too.
export { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(CURRENT_COST.saltLength);
  const hash = await scrypt(password.normalize("NFKC"), salt, CURRENT_COST.keylen);

  return [ALGORITHM, CURRENT_COST.keylen, salt.toString("base64url"), hash.toString("base64url")].join(
    "$",
  );
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, keylenRaw, saltRaw, hashRaw] = encoded.split("$");

  if (algorithm !== ALGORITHM || !saltRaw || !hashRaw) return false;

  const keylen = Number(keylenRaw);
  if (!Number.isInteger(keylen) || keylen < 16) return false;

  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(hashRaw, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), salt, keylen);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when a stored hash was produced with weaker parameters than we use now. */
export function needsRehash(encoded: string): boolean {
  const [, keylenRaw, saltRaw] = encoded.split("$");
  return Number(keylenRaw) < CURRENT_COST.keylen || !saltRaw || saltRaw.length < 20;
}