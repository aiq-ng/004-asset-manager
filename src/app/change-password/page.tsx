import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/features/settings/change-password-form";
import { forceChangePasswordAction } from "@/features/auth/actions";
import { getActor } from "@/lib/auth/actor";
import { hasPassword } from "@/lib/services/auth";
import { superadminExists } from "@/lib/services/staff-bootstrap";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * The forced password change for an invited session.
 *
 * Every other signed-in page passes through the `(app)` layout, whose guard
 * bounces anyone still carrying a temporary password to `/change-password`. That
 * makes this the one page that **cannot** live inside `(app)`: its own layout
 * would run the guard and redirect back here forever. So it sits outside the
 * group, next to `/login`, and reads the actor directly — the same reason
 * `requirePageActor`'s comment says this page does not go through it.
 *
 * The flow it serves: `requestPasswordReset`, `resendInvite` and a
 * password-less `POST /api/staff` all mint a temporary password and set
 * `mustChangePassword`. The API half of that was already complete — those
 * sessions are allowed through `PASSWORD_CHANGE_EXEMPT_PATHS` — but there was no
 * screen to finish it on, so an invited account could sign in and then had
 * nowhere to go but a 404.
 *
 * Three ways off this page, all deliberate:
 *  - no session at all: `/login`, because there is nobody to change anything for
 *  - already changed it (the session outlived the flag): back to the register,
 *    which is where an invited person was trying to get to in the first place
 *  - nothing bootstrapped yet: `/setup`, which cannot be reached with a session
 */
export default async function ChangePasswordPage() {
  if (!(await superadminExists())) redirect("/setup");

  // Read directly rather than through `requirePageActor`: that guard is what
  // sent them here, and asking it for the actor would be the loop.
  const actor = await getActor();
  if (!actor) redirect("/login");

  // The flag is the only reason to be on this screen. If it has already been
  // cleared — a second tab, or a link opened after the change — the register is
  // the honest destination rather than a form asking for something unnecessary.
  if (!actor.mustChangePassword) redirect("/");

  // An invited account always has the temporary password it was sent, so the
  // current-password check applies. Passed as `true` because that is what the
  // service will enforce; reading it would be a query that cannot change the
  // outcome.
  const passwordSet = await hasPassword(actor.id);

  return (
    <div className="relative flex min-h-dvh flex-col bg-c54-bg-surface">
      <div className="flex items-center justify-end p-c54-pad">
        <ThemeToggle />
      </div>

      {/* Same treatment as the sign-in card: a lit side for the elevation to
          cast a shadow away from, so this reads as a contained space rather than
          a form that failed to load. */}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/logo.png"
                alt=""
                aria-hidden="true"
                className="mb-c54-4 h-11 w-auto"
              />
              <h1 className="text-c54-xl text-c54-text-primary">Choose your password</h1>
              <p className="mt-c54-2 text-c54-sm text-c54-text-secondary">
                You are signed in with the temporary password sent to {actor.email}. Set your own
                to reach the register.
              </p>
            </div>

            {/* No `closeOnSuccess`: this is a page, not a dialog, and
                `forceChangePasswordAction` navigates to the register itself once
                the change lands. The whole screen is the task, so there is
                nothing to close. */}
            <div className="border-t border-c54-border-strong bg-c54-bg-muted/40 px-c54-pad-lg py-c54-pad-lg">
              <ChangePasswordForm
                email={actor.email}
                hasPassword={passwordSet}
                action={forceChangePasswordAction}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}