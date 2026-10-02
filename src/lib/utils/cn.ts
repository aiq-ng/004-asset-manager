/**
 * Conditional className joiner.
 *
 * Deliberately dependency-free: this project ships no `clsx`/`tailwind-merge`,
 * and components take explicit props (`variant`, `size`) rather than accepting
 * arbitrary overrides, so a merge-capable joiner would not buy much.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  let result = "";
  for (const value of values) {
    if (!value) continue;
    result = result ? `${result} ${value}` : value;
  }
  return result;
}
