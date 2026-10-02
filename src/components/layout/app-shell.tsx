import type { StaffRole } from "@/generated/prisma/client";
import { Masthead } from "@/components/layout/masthead";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { navItemsFor } from "@/lib/nav";

/**
 * Application shell: masthead, sidebar and content column.
 *
 * A Server Component — the actor and the role-filtered navigation are resolved
 * here and handed to the two client islands that need interactivity. The shell is
 * chrome, so it sits in the route group layout rather than the root layout,
 * leaving `/login` free of it.
 */
export function AppShell({
  actor,
  children,
}: {
  actor: { name: string; email: string; department: string; role: StaffRole };
  children: React.ReactNode;
}) {
  const navItems = navItemsFor(actor.role);

  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead navItems={navItems} actor={actor} />

      <div className="flex flex-1">
        {/* Hidden below `lg`, where the drawer takes over. */}
        <aside className="c54-no-print sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-c54-border-default bg-c54-chrome-bg lg:block">
          <SidebarNav items={navItems} />

          <div className="mt-auto px-c54-pad py-c54-4 text-c54-2xs text-c54-chrome-fg/50">
            <p className="font-c54-mono">Signed in as {actor.role}</p>
            <p className="mt-c54-1">{actor.email}</p>
          </div>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[var(--c54-content-max)] px-c54-pad-lg py-c54-section">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}