import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { requirePageActor } from "@/lib/server/guard";
import { superadminExists } from "@/lib/services/staff-bootstrap";

/**
 * Authenticated shell.
 *
 * The guard runs here rather than in each page: it is the one place every signed
 * in route passes through, and `getActor` is memoised per request, so the shell's
 * lookup and the page's own lookups share a single database round trip.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Ahead of `requirePageActor`, not after it. On an unbootstrapped install no
  // session can ever succeed, so checking first sends an anonymous visitor
  // straight to the form that can fix it. The other order works too, but only
  // after bouncing them through /login and back again.
  if (!(await superadminExists())) redirect("/setup");

  const actor = await requirePageActor();

  return (
    <AppShell
      actor={{
        id: actor.id,
        name: actor.name,
        email: actor.email,
        department: actor.department,
        role: actor.role,
      }}
    >
      {children}
    </AppShell>
  );
}