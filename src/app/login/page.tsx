import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { getActor } from "@/lib/auth/actor";
import { superadminExists } from "@/lib/services/staff-bootstrap";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Sign-in screen.
 *
 * Outside the `(app)` route group, so it renders without the shell — and outside
 * its layout, so there is no guard that would redirect a signed-in user away from
 * it. The redirect below handles that case instead.
 *
 * This is the only screen a visitor is guaranteed to see, so it carries the
 * product's identity on its own: the form sits in a card with real elevation
 * rather than floating directly on the page colour. Depth here is doing work the
 * app shell normally does — giving the eye somewhere to land, and signalling that
 * this is a contained, deliberate space rather than a bare form that failed to
 * load. It stays a plain server component; none of this needs a client boundary.
 *
 * The superadmin check comes before the session check. On an install with no
 * superadmin, this form cannot ever succeed — there is no account to authenticate
 * against — so showing it would be showing a dead end. `/setup` is the only page
 * that can resolve that state.
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  if (!(await superadminExists())) redirect("/setup");

  // Already signed in: nothing to do here.
  if (await getActor()) redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");

  return (
    <div className="relative flex min-h-dvh flex-col bg-c54-bg-surface">
      <div className="flex items-center justify-end p-c54-pad">
        <ThemeToggle />
      </div>

      {/* A soft wash behind the card so it has a lit side to cast a shadow away
          from. Anchored to `action-primary` at a few percent so it follows the
          theme instead of washing a fixed blue over the dark one. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-c54-action-primary/[0.08] to-transparent"
      />

      <main className="relative flex flex-1 items-center justify-center px-c54-pad-lg pb-c54-section">
        <div className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card shadow-c54-xl">
            {/* Hairline across the top edge. A 1px light line is what stops a
                lifted surface from looking like a flat rectangle with a blur
                painted under it — it reads as the edge catching the light. */}
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
              <h1 className="text-c54-xl text-c54-text-primary">Inventory Control</h1>
              <p className="mt-c54-2 text-c54-sm text-c54-text-secondary">
                Sign in to reach the asset register.
              </p>
            </div>

            {/* The form sits on its own tinted band, separated by a rule. Two
                tones inside one card gives the inputs a surface to sit on, which
                is most of what makes the controls read as inset rather than
                pasted on.

                The rule is `border-strong` rather than the `border-default` the
                app's own card headers use. A 40% `bg-muted` tint over `bg-card`
                lands within 0.006 luminance of the card in dark mode — visually
                nothing — so on this surface the separation has to come from the
                divider, and the stronger token is the one that reads in both
                themes (darker in light, lighter in dark). */}
            <div className="border-t border-c54-border-strong bg-c54-bg-muted/40 px-c54-pad-lg py-c54-pad-lg">
              <LoginForm next={next} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}