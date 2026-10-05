"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { SidebarNav } from "@/components/layout/sidebar-nav";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/lib/nav";

/**
 * Off-canvas navigation for small screens.
 *
 * Rendered inline rather than through a portal: it lives inside the masthead,
 * which is already the top layer at that width, and keeping it there avoids a
 * flash of the sidebar before the client tree mounts.
 */
export function MobileNav({ items, open, onClose }: { items: NavItem[]; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // A route change should always dismiss the drawer, otherwise it stays on top
  // of the page the user just chose.
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    if (!open) return;

    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    // Stop the page behind the drawer from scrolling with it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-c54-bg-inverse/60"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 flex w-72 animate-slide-in flex-col bg-c54-chrome-bg"
      >
        <div className="flex items-center justify-between px-c54-pad py-c54-3">
          <p className="text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-chrome-fg/60 uppercase">
            Navigate
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-c54-sm p-c54-2 text-c54-chrome-fg/70 transition-colors hover:bg-c54-bg-inverse/15 hover:text-c54-chrome-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <SidebarNav items={items} onNavigate={onClose} />
      </div>
    </div>
  );
}

/** Hamburger toggle for the masthead. */
export function MobileNavTrigger({
  open,
  onToggle,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Open navigation"
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-c54-sm text-c54-masthead-fg transition-colors hover:bg-c54-bg-inverse/10 lg:hidden",
        className,
      )}
    >
      <Menu className="size-4" />
    </button>
  );
}