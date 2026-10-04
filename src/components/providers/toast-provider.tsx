"use client";

import { Toaster } from "react-hot-toast";

/**
 * Toast host for the whole app.
 *
 * Wraps `react-hot-toast`'s `Toaster` rather than hand-rolling the viewport,
 * queue and timers: the provider this replaced was ~90 lines of state
 * management for behaviour the library already gets right, including the
 * accessibility details that are easy to omit — each toast is a `role="status"`
 * with `aria-live="polite"`, an error becomes `role="alert"`.
 *
 * The options below only restyle it into the app. Position, stacking and the
 * dismissal affordances are the library's own.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        gutter={8}
        toastOptions={{
          // `var()`, not a literal: the token swaps with the theme, so a hex
          // baked in here would be the one surface that stayed light in dark
          // mode.
          style: {
            background: "var(--c54-color-bg-card)",
            color: "var(--c54-color-text-primary)",
            border: "1px solid var(--c54-color-border-default)",
            borderRadius: "var(--c54-radius-card)",
            boxShadow: "var(--c54-shadow-popover)",
            fontSize: "var(--c54-font-size-sm)",
          },
          // An error is the one a user has to act on, so it stays up longer
          // than a confirmation.
          success: { duration: 4000 },
          error: { duration: 8000 },
        }}
      />
    </>
  );
}
