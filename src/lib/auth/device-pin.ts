import { randomInt } from "node:crypto";

import { DEVICE_PIN_LENGTH } from "@/lib/auth/device-pin-policy";

// Re-exported so server-side callers have one obvious import; the values live in
// a module with no Node builtins, so client forms can use them too.
export { DEVICE_PIN_LENGTH, DEVICE_PIN_REQUIREMENT } from "@/lib/auth/device-pin-policy";

/**
 * The device PIN generator.
 *
 * A PIN is the opposite trade to the device password: it exists to be typed on a
 * device's own keypad without a keyboard, so its length is fixed by the device
 * rather than chosen for entropy, and there is no point dressing it up as a
 * stronger secret than it is. Four digits is 10^4 possibilities, which is the
 * right size for "stops a colleague opening your laptop" and the wrong size for
 * anything facing the internet — see `generateDevicePassword` for the credential
 * that has to carry that weight instead.
 *
 * The range is `1000..9999` rather than `0000..9999` on purpose: a generated PIN
 * is read off a screen and typed somewhere else, and `0427` invites the classic
 * "it says 427 and it is wrong" failure. Excluding the leading zero costs one
 * decimal of the space — 9000 of 10000 — and removes a whole class of mistyped
 * codes, which is the better trade for a credential whose failure mode is a
 * human at a keypad.
 */
export function generateDevicePin(): string {
  return String(randomInt(10 ** (DEVICE_PIN_LENGTH - 1), 10 ** DEVICE_PIN_LENGTH));
}
