import { AppShell } from "@/components/layout/app-shell";
import { requirePageActor } from "@/lib/server/guard";

/**
 * Authenticated shell.
 *
 * The guard runs here rather than in each page: it is the one place every signed
 * in route passes through, and `getActor` is memoised per request, so the shell's
 * lookup and the page's own lookups share a single database round trip.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requirePageActor();

  return (
    <AppShell
      actor={{
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