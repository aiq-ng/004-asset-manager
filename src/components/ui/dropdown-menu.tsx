"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils/cn";

/** Gap between the trigger and the panel, and the viewport-edge safety margin. */
const GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Panel coordinates, measured against the trigger's bounding rect.
 *
 * `placement` records whether the panel ended up above or below the trigger —
 * the animation should always grow out of the trigger's edge, never slide in
 * from the far side of it.
 */
type PanelPosition = {
  top: number;
  left: number;
  placement: "top" | "bottom";
};

/**
 * Lightweight menu.
 *
 * The trigger is a real `<button>` with `aria-haspopup`/`aria-expanded`; the
 * panel is portaled to `document.body` and positioned with `position: fixed`
 * against the trigger's rect. The portal is what keeps the menu out of trouble:
 * it lives inside `<Card className="overflow-hidden">` shells and
 * `overflow-x-auto` table wrappers here, and an absolutely-positioned panel in
 * there is clipped the moment a bottom row opens it — the menu would be cut off
 * exactly where the card ends. A portal plus fixed positioning escapes every
 * ancestor clip, and measuring the trigger's viewport rect lets the panel flip
 * above the trigger when there is no room below (the last-row case) and clamp
 * against the viewport edges.
 *
 * Outside-click and Escape close it, and arrow keys move between items.
 */
export function DropdownMenu({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    id: string;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
  }) => React.ReactNode;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {trigger({
        open,
        toggle: () => setOpen((current) => !current),
        id: triggerId,
        "aria-haspopup": "menu",
        "aria-expanded": open,
      })}

      {open
        ? createPortal(
            // The panel owns its position state and mounts fresh on every open,
            // so there is no stale geometry from the previous open to clear.
            <MenuPanel anchorRef={rootRef} panelRef={panelRef} align={align} triggerId={triggerId}>
              {typeof children === "function" ? children({ close }) : children}
            </MenuPanel>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * The portaled panel, measured against its trigger.
 *
 * Before the first measurement the panel renders hidden, so it never flashes at
 * the unpositioned origin — the measuring effect runs after paint, but
 * invisibly. Scroll and resize listeners keep it pinned to the trigger while
 * the page moves under an open menu; captured scroll because inner containers
 * (the table's own scrollport among them) don't bubble their scroll events.
 */
function MenuPanel({
  anchorRef,
  panelRef,
  align,
  triggerId,
  children,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  align: "start" | "end";
  triggerId: string;
  children: React.ReactNode;
}) {
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const positionPanel = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const rect = anchor.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Prefer below the trigger; flip above when the panel would run past the
    // bottom of the viewport and there is more room on top. This is the case
    // that used to be swallowed by the table shell's bottom edge.
    const roomBelow = viewportHeight - rect.bottom;
    const placement: PanelPosition["placement"] =
      roomBelow < panelHeight + GAP + VIEWPORT_MARGIN && rect.top > roomBelow ? "top" : "bottom";
    const top = placement === "top" ? rect.top - panelHeight - GAP : rect.bottom + GAP;

    // `end` lines the panel's right edge up with the trigger's, `start` the
    // left edges; either way clamp so the panel never hangs off the viewport.
    const preferred = align === "end" ? rect.right - panelWidth : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferred),
      Math.max(VIEWPORT_MARGIN, viewportWidth - panelWidth - VIEWPORT_MARGIN),
    );

    setPosition({ top, left, placement });
  }, [align, anchorRef, panelRef]);

  useEffect(() => {
    positionPanel();

    window.addEventListener("resize", positionPanel);
    document.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      document.removeEventListener("scroll", positionPanel, true);
    };
  }, [positionPanel]);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-labelledby={triggerId}
      style={{
        position: "fixed",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? undefined : "hidden",
      }}
      className={cn(
        "z-50 min-w-44 overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card p-c54-1 shadow-c54-popover",
        position?.placement === "top" ? "animate-rise-up" : "animate-rise",
      )}
    >
      {children}
    </div>
  );
}

const ITEM_CLASS =
  "flex w-full items-center gap-c54-2 rounded-c54-sm px-c54-3 py-c54-2 text-left text-c54-xs transition-colors " +
  "hover:bg-c54-action-ghost-hover disabled:pointer-events-none disabled:opacity-45";

/**
 * A menu row. Renders a `<Link>` when `href` is given and a `<button>`
 * otherwise, which keeps navigation and in-menu actions from nesting invalid
 * interactive elements inside one another.
 */
export function DropdownItem({
  className,
  danger,
  href,
  children,
  ...rest
}: {
  href?: string;
  danger?: boolean;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const classes = cn(ITEM_CLASS, danger && "text-c54-text-danger hover:bg-c54-bg-danger", className);

  if (href) {
    return (
      <Link role="menuitem" href={href} className={cn(classes, !danger && "text-c54-text-primary")}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-c54-3 py-c54-2 text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="my-c54-1 h-px bg-c54-border-default" />;
}
