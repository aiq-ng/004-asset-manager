import { ClipLoader } from "react-spinners";

import { cn } from "@/lib/utils/cn";

/**
 * Circular loading indicator for a busy button.
 *
 * `ClipLoader` takes its size in pixels rather than a class, so the token
 * namespace does not reach it; the size is chosen per button scale instead.
 *
 * `color` is `currentColor` on purpose. The library's own default is `#000000`,
 * which is unreadable on the `primary` and `danger` fills and invisible in dark
 * mode — inheriting the button's text colour is what makes one indicator work
 * across all five variants.
 *
 * `aria-hidden` because the button carrying it sets `aria-busy` and swaps its
 * own label to the pending text; announcing a spinner as well would talk over
 * the thing that actually explains what is happening.
 */
export function Spinner({ className, size = 14 }: { className?: string; size?: number }) {
  return (
    <ClipLoader
      size={size}
      color="currentColor"
      speedMultiplier={0.9}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    />
  );
}
