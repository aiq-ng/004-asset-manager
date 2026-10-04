import type { StaffRole } from "@/generated/prisma/client";
import Link from "next/link";

import { Masthead } from "@/components/layout/masthead";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SidebarUserSection } from "@/components/layout/sidebar-user-section";
import { hasPassword } from "@/lib/services/auth";
import { navItemsFor } from "@/lib/nav";

/**
 * Application shell: masthead, sidebar and content column.
 *
 * A Server Component — the actor and the role-filtered navigation are resolved
 * here and handed to the two client islands that need interactivity. The shell is
 * chrome, so it sits in the route group layout rather than the root layout,
 * leaving `/login` free of it.
 */
export async function AppShell({
  actor,
  children,
}: {
  actor: { id: string; name: string; email: string; department: string; role: StaffRole };
  children: React.ReactNode;
}) {
  const navItems = navItemsFor(actor.role);
  const passwordSet = await hasPassword(actor.id);

  return (
    <div className="flex min-h-dvh">
      {/* Full-height sidebar: brand on top, nav scrolling in the middle,
          actor footer pinned at the bottom. Hidden below `lg`, where the
          drawer takes over. */}
      <aside className="c54-no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-hidden border-r border-c54-border-default bg-c54-chrome-bg lg:flex">
        <Link
          href="/"
          className="flex h-14 shrink-0 items-center gap-c54-3 border-b border-c54-border-default px-c54-pad-lg"
        >
          {/* Brand mark from /public: static, so no next/image optimization
              hop; fixed height with a bounded width keeps any transparent
              padding in the file from stretching the bar. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo.png"
            alt=""
            aria-hidden="true"
            className="h-9 w-auto shrink-0"
          />
          <span className="min-w-0">
            <span className="block truncate text-c54-sm font-c54-extrabold tracking-c54-tight uppercase">
              Inventory Control
            </span>
            <span className="hidden truncate text-c54-2xs text-c54-chrome-fg/70 sm:block">
              Asset register
            </span>
          </span>
        </Link>

        {/* Nav scrolls on its own; the footer below never moves. */}
        <div className="min-h-0 my-6 flex-1 overflow-y-auto">
          <SidebarNav items={navItems} />
        </div>

        <div className="shrink-0">
          <SidebarUserSection actor={actor} hasPassword={passwordSet} />
        </div>
      </aside>

      {/* Right column: masthead starts after the sidebar, content below. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Masthead navItems={navItems} actor={actor} />

        <main id="main" className="c54-app-content min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[var(--c54-content-max)] px-c54-pad-lg py-c54-section">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}