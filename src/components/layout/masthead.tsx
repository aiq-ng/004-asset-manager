"use client";

import { useState } from "react";
import Link from "next/link";

import { MobileNav, MobileNavTrigger } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import type { StaffRole } from "@/generated/prisma/client";
import type { NavItem } from "@/lib/nav";

/**
 * Masthead and its mobile drawer.
 *
 * A Server Component cannot own the drawer-open state, so the interactive parts
 * live in this client island. Everything inside is passed in as already-resolved
 * data — the shell does the auth and query work, this only handles clicks.
 */
export function Masthead({
  navItems,
  actor,
}: {
  navItems: NavItem[];
  actor: { name: string; email: string; department: string; role: StaffRole };
}) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <>
      {/* The bar is deliberately quiet: a gray surface with a hairline and a
          soft shadow for depth, the logo image carrying the brand colour. The
          print class keeps the printed label page free of screen chrome. */}
      <header className="c54-no-print sticky top-0 z-40 border-b border-c54-border-default bg-c54-masthead-bg text-c54-masthead-fg shadow-c54-xs">
        <div className="flex h-14 items-center gap-c54-3 px-c54-pad-lg">
          <MobileNavTrigger open={navOpen} onToggle={() => setNavOpen((current) => !current)} />

          <Link href="/" className="flex min-w-0 items-center gap-c54-3">
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
              <span className="hidden truncate text-c54-2xs text-c54-masthead-fg/70 sm:block">
                Asset register
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-c54-1">
            <span className="hidden items-center gap-c54-2 rounded-c54-pill border border-c54-border-strong bg-c54-bg-card/60 px-c54-3 py-0.5 font-c54-mono text-c54-2xs text-c54-text-secondary md:inline-flex">
              <span className="size-1.5 rounded-c54-full bg-c54-status-healthy" />
              Operational
            </span>
            <ThemeToggle />
            <div className="rounded-c54-full bg-c54-bg-card/95 ring-1 ring-c54-border-default ring-inset">
              <UserMenu {...actor} />
            </div>
          </div>
        </div>
      </header>

      <MobileNav items={navItems} open={navOpen} onClose={() => setNavOpen(false)} />
    </>
  );
}