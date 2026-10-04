import Link from "next/link";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { superadminExists } from "@/lib/services/staff-bootstrap";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * "Forgot password" screen.
 *
 * Sits next to /login outside the `(app)` group: no shell, no guard. The card
 * mirrors the sign-in screen on purpose — same elevation, same hairline — so a
 * user bounced here from the sign-in form sees one continuous flow, not a
 * different product.
 *
 * Gated on the superadmin check for the same reason /login is. On an
 * unbootstrapped install there is no account to send a reset to, so this form
 * would accept an address, claim a link is on its way, and send nothing —
 * a worse dead end than a redirect, because it looks like it worked.
 */
export default async function ForgotPasswordPage() {
  if (!(await superadminExists())) redirect("/setup");

  return (
    <div className="relative flex min-h-dvh flex-col bg-c54-bg-surface">
      <div className="flex items-center justify-end p-c54-pad">
        <ThemeToggle />
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-c54-action-primary/[0.08] to-transparent"
      />

      <main className="relative flex flex-1 items-center justify-center px-c54-pad-lg pb-c54-section">
        <div className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card shadow-c54-xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-c54-border-strong to-transparent"
            />

            <div className="px-c54-pad-lg pt-c54-pad-lg pb-c54-5">
              <h1 className="text-c54-xl text-c54-text-primary">Reset your password</h1>
              <p className="mt-c54-2 text-c54-sm text-c54-text-secondary">
                Enter the email on your account and we&apos;ll send you a link to
                set a new one.
              </p>
            </div>

            <div className="border-t border-c54-border-strong bg-c54-bg-muted/40 px-c54-pad-lg py-c54-pad-lg">
              <ForgotPasswordForm />
            </div>
          </div>

          <p className="mt-c54-4 text-center text-c54-xs text-c54-text-muted">
            Remembered it after all?{" "}
            <Link href="/login" className="text-c54-action-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
