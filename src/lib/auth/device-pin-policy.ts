/**
 * Device PIN policy constants.
 *
 * Split out from `device-pin.ts` for the same reason `device-password-policy.ts`
 * is split out from `device-password.ts`: the generator imports `node:crypto`, so
 * a client component importing a constant from it would pull a Node builtin into
 * the browser bundle. The credentials card is a client island, so its "exactly 4
 * digits" hint has to be readable from there.
 */

/**
 * A device PIN is four digits, and nothing else.
 *
 * This is deliberately not a range. The password policy has a floor and a
 * ceiling because a typed password is a free-form secret; a PIN is a fixed
 * format that a device's own keypad accepts, so "at least 4" would quietly admit
 * `12345` and hand the operator a code the device will not take. Exactly four
 * digits is the whole rule, and both the generator and the validator are built
 * from this one number so they cannot drift apart.
 */
export const DEVICE_PIN_LENGTH = 4;

/** The digits-only rule, as a pattern a form can check before submitting. */
export const DEVICE_PIN_PATTERN = /^\d+$/;

/** Shown next to the input, so the rule is stated before a failed submit. */
export const DEVICE_PIN_REQUIREMENT = `Exactly ${DEVICE_PIN_LENGTH} digits.`;
