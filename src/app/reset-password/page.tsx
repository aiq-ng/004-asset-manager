import Link from "next/link";

import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * "Set a new password" screen, reached from the email link.
 *
 * The token lives in the query string; the page hands it to the form, which
 * posts it back as a hidden field. It is never validated here — the service is
 * the single judge of whether a token is real, unused and unexpired, and it
 * answers every bad case with the same message.
 */
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

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
              <h1 className="text-c54-xl text-c54-text-primary">Choose a new password</h1>
              <p className="mt-c54-2 text-c54-sm text-c54-text-secondary">
                Pick something you don&apos;t use anywhere else. Any active
                sessions are signed out afterwards.
              </p>
            </div>

            <div className="border-t border-c54-border-strong bg-c54-bg-muted/40 px-c54-pad-lg py-c54-pad-lg">
              <ResetPasswordForm token={token} />
            </div>
          </div>

          <p className="mt-c54-4 text-center text-c54-xs text-c54-text-muted">
            Didn&apos;t request this?{" "}
            <Link href="/login" className="text-c54-action-primary hover:underline">
              Back to sign in
            </Link>{" "}
            — your password is unchanged.
          </p>
        </div>
      </main>
    </div>
  );
}
