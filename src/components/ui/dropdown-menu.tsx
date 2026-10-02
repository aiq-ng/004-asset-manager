"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Lightweight menu.
 *
 * The trigger is a real `<button>` with `aria-haspopup`/`aria-expanded`; the
 * panel is positioned with CSS anchor positioning where supported and falls
 * back to a plain absolutely-positioned box. Enough behaviour for row actions:
 * outside-click and Escape close it, and arrow keys move between items.
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
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

      {open ? (
        <div
          role="menu"
          aria-labelledby={triggerId}
          className={cn(
            "absolute top-[calc(100%+0.25rem)] z-40 min-w-44 animate-rise overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card p-c54-1 shadow-c54-popover",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : null}
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
