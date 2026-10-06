/**
 * Device password policy constants.
 *
 * Split out from `device-password.ts` for the same reason `password-policy.ts`
 * is split out from `password.ts`: the generator imports `node:crypto`, so a
 * client component importing a constant from it would pull a Node builtin into
 * the browser bundle. The credential card is a client island, so its "at least
 * N characters" hint has to be readable from there.
 */

/**
 * The staff password policy (`MIN_PASSWORD_LENGTH = 12`) does not apply here, and
 * reusing it would be wrong twice over: a generated `LAP-K7QM-3XB4` would fail its
 * own check, and a hand-typed device password is frequently read off a screen to
 * somebody on a phone, where a 12-character minimum is an obstacle rather than a
 * safeguard.
 *
 * This is the floor for the "set it myself" path. It is low because the value is
 * not holding an account open on a server that can be brute-forced — it is
 * stopping a laptop being carried out of a building — and high enough to rule out
 * a serial number someone has already read off the label.
 */
export const MIN_DEVICE_PASSWORD_LENGTH = 6;

/** Generous ceiling: long enough for a pasted secret, short enough to stay a field. */
export const MAX_DEVICE_PASSWORD_LENGTH = 200;

/** Shown next to the input, so the rule is stated before a failed submit. */
export const DEVICE_PASSWORD_REQUIREMENT = `At least ${MIN_DEVICE_PASSWORD_LENGTH} characters.`;