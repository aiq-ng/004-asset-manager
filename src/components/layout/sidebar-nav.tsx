"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Building,
  FileText,
  Layers,
  LayoutDashboard,
  Package,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { NavIcon, NavItem } from "@/lib/nav";

/**
 * Nav key to lucide component.
 *
 * The keys stay strings rather than holding the components themselves, because
 * `lib/nav.ts` is imported by server components that must not pull an icon
 * library into their bundle — the mapping is what turns a key into a glyph, and
 * it lives here in the one client component that draws them.
 */
const NAV_GLYPHS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  box: Package,
  swap: ArrowLeftRight,
  layers: Layers,
  users: Users,
  building: Building,
  audit: FileText,
};

/**
 * Sidebar navigation.
 *
 * Active state is derived from the pathname, so it stays correct without any
 * server round trip. The exact/prefix rule matters: `/assets` must stay lit on
 * `/assets/IT-LAP-0001`, but `/staff` must not light up for `/settings`.
 */
export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-c54-1 p-c54-3">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : isActive(pathname, item.href);
        const Glyph = NAV_GLYPHS[item.icon];

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-c54-3 rounded-c54-button py-c54-2 pr-c54-3 pl-c54-4 transition-colors duration-c54-fast",
              active
                ? "bg-c54-bg-inverse/15 font-c54-semibold text-c54-chrome-fg"
                : "text-c54-chrome-fg/70 hover:bg-c54-bg-inverse/10 hover:text-c54-chrome-fg",
            )}
          >
            {/* The rail grows to full height on hover as well as on the active
                item, so the drawer answers a pointer before it is clicked. */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-1.5 left-0 w-0.5 rounded-c54-full transition-colors",
                active ? "bg-c54-text-accent" : "bg-transparent group-hover:bg-c54-chrome-fg/30",
              )}
            />
            <Glyph
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                active ? "text-c54-text-accent" : "text-c54-chrome-fg/60",
              )}
            />
            <span className="min-w-0">
              <span className="block truncate text-c54-sm font-c54-medium">{item.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** `/assets` is active on `/assets/IT-LAP-0001`, but `/a` is not active on `/assets`. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}