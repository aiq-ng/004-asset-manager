/**
 * Password policy constants.
 *
 * Kept apart from `password.ts` on purpose: that module imports `node:crypto` for
 * scrypt, so a client component importing a constant from it would drag a Node
 * builtin into the browser bundle. Anything a form needs to *tell* the user —
 * the minimum length, the requirement list — belongs here.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

/** Shown next to password inputs, so the rule is stated before a failed submit. */
export const PASSWORD_REQUIREMENT = `At least ${MIN_PASSWORD_LENGTH} characters.`;