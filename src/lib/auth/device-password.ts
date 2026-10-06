import { randomInt } from "node:crypto";

// Re-exported so server-side callers have one obvious import; the values live in
// a module with no Node builtins, so client forms can use them too.
export {
  MIN_DEVICE_PASSWORD_LENGTH,
  MAX_DEVICE_PASSWORD_LENGTH,
  DEVICE_PASSWORD_REQUIREMENT,
} from "@/lib/auth/device-password-policy";

/**
 * The device password generator.
 *
 * The device password is the one credential in this system that has to be both
 * strong enough to sit on a laptop and easy enough to read down a phone and
 * retype at a desk. A 16-character mixed-case random string is unreadable aloud
 * (`O` vs `0`, `l` vs `1`, and nobody can tell where one group ends), which is
 * the actual failure mode — not brute force. So the format is built around that
 * instead of around maximum entropy:
 *
 *   LAP-K7QM-3XB4
 *
 * The asset type prefix tells the reader what the code is for before they have
 * finished saying it, which is most of why it survives being read out loud.
 * Everything inside it is drawn from a 32-symbol alphabet with the confusable
 * characters removed — no `0`, no `1`, no `I`, no `L`, no `O` — so `K7QM` is never
 * misheard as `K7OM`. Digits and letters still mix, so it is not a word list.
 *
 * Entropy is 24 * 32^7 ≈ 2^52 for the random part, which is the right trade for a
 * credential whose whole purpose is being recoverable by a human: the value is
 * not defending a service from an attacker with compute, it is stopping a laptop
 * from being walked off a desk. See `generateTemporaryPassword` in
 * `lib/auth/password.ts` for the staff-account equivalent, which is longer
 * because nobody ever has to read that one aloud.
 */

/**
 * 32 symbols: digits `2`-`9` and uppercase letters minus the confusables.
 *
 * Exactly 32 rather than "about 30" so that a symbol is one unbiased draw —
 * `randomInt` rejects any range above 2^48, and a 31-symbol alphabet would throw
 * away the top of that range for every character generated.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** The subset that can start the code. 24 of the 32. */
const LEADING_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";

/** Characters of randomness. See the entropy note above before lowering this. */
const RANDOM_LENGTH = 8;

/** Group size, so the code is read aloud as two words rather than one. */
const GROUP_SIZE = 4;

/**
 * Sanitises an asset type code for use as the readable prefix.
 *
 * Codes are registered by an admin and are normally already tidy (`LAP`), but
 * nothing forces them to be, and a code containing a space or a dash would make
 * the generated password ambiguous to split and therefore to read out. Lookalike
 * characters go too, for the same reason they are excluded from the alphabet.
 */
function prefixFrom(code: string): string {
  const cleaned = code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[ILO01]/g, "");

  return cleaned.slice(0, 6);
}

/**
 * Builds a device password for an asset.
 *
 * `randomInt` rather than indexing `randomBytes`: modulo bias on a 32-symbol
 * alphabet over 256 bytes would favour the first symbol by a factor of eight,
 * which is small but free to avoid.
 *
 * The prefix falls back to `DEV` for a type whose code is entirely confusable
 * (`IL0` sanitises to nothing), so the format never degenerates into a bare
 * random string and the reader always gets the "what is this for" cue.
 */
export function generateDevicePassword(assetTypeCode: string): string {
  const prefix = prefixFrom(assetTypeCode) || "DEV";

  let random = LEADING_LETTERS[randomInt(LEADING_LETTERS.length)];
  for (let i = 1; i < RANDOM_LENGTH; i++) {
    random += ALPHABET[randomInt(ALPHABET.length)];
  }

  const groups = random.match(new RegExp(`.{1,${GROUP_SIZE}}`, "g")) ?? [random];

  return `${prefix}-${groups.join("-")}`;
}