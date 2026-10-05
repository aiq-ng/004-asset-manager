import { redirect } from "next/navigation";

import { BootstrapForm } from "@/features/auth/bootstrap-form";
import { superadminExists } from "@/lib/services/staff-bootstrap";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * First-run setup: create the account the whole install hangs off.
 *
 * The app cannot be signed into without a SUPERADMIN — nothing can grant the
 * role but the bootstrap, and the bootstrap used to be a CLI command. That left
 * a real failure mode on a fresh install: a database with staff rows but no
 * superadmin, presenting a login form that nobody had the credentials for. This
 * page closes it by moving the bootstrap into the app, where the person who is
 * looking at it can complete it.
 *
 * Self-sealing, which is the property that makes it safe to have an unauthenticated
 * endpoint that creates an account with the highest role in the system: once a
 * superadmin exists, this page redirects away and the action refuses. There is
 * no window in which both the form and a live superadmin exist.
 *
 * Deliberately outside the `(app)` group, like `/login`, so it renders without
 * the shell and without the guard that would redirect an anonymous visitor away
 * from the one screen that can help them.
 */
export default async function SetupPage() {
  // Checked here so the form is never shown to somebody whose install is already
  // working, and re-checked in the service, because this render and the write
  // that follows it are not one atomic step.
  if (await superadminExists()) redirect("/login");

  return (
    <div className="relative flex min-h-dvh flex-col bg-c54-bg-surface">
      <div className="flex items-center justify-end p-c54-pad">
        <ThemeToggle />
      </div>

      {/* The same soft wash as the login screen, for the same reason: the card
          needs a lit side to cast its shadow away from. */}
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
              <h1 className="text-c54-xl text-c54-text-primary">Set up your install</h1>
              <p className="mt-c54-2 text-c54-sm text-c54-text-secondary">
                There is no superadmin yet, so nobody can sign in. Create one to continue.
              </p>
            </div>

            <div className="border-t border-c54-border-strong bg-c54-bg-muted/40 px-c54-pad-lg py-c54-pad-lg">
              <BootstrapForm />
            </div>
          </div>

          {/* Spelled out because it is the one irreversible consequence of the
              screen: there is exactly one superadmin, and it cannot be created
              again from here. */}
          <p className="mt-c54-4 text-center text-c54-xs text-c54-text-muted">
            There is exactly one superadmin. Once created, this screen closes for good.
          </p>
        </div>
      </main>
    </div>
  );
}
