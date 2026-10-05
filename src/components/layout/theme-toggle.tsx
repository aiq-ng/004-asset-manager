"use client";

import { Moon, Sun } from "lucide-react";

import { useThemeMode } from "@/components/providers/theme-mode-provider";
import { cn } from "@/lib/utils/cn";

/**
 * Light/dark switch.
 *
 * Both glyphs are always rendered and their visibility is decided by CSS from the
 * `data-c54-mode` attribute on `<html>`, never by branching on React state. The
 * attribute is written before first paint by the bootstrap script, so the icon
 * is right immediately — whereas reading `mode` from context would render the
 * server's "light" glyph and visibly flip once the store hydrates.
 */
export function ThemeToggle({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "inverse";
}) {
  const { toggle } = useThemeMode();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle colour mode"
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-c54-sm transition-colors duration-c54-fast",
        tone === "inverse"
          ? "text-c54-chrome-fg/80 hover:bg-c54-bg-inverse/15 hover:text-c54-chrome-fg"
          : "text-c54-text-secondary hover:bg-c54-action-ghost-hover hover:text-c54-text-primary",
        className,
      )}
    >
      <Sun className="size-4 [html[data-c54-mode='dark']_&]:hidden" />
      <Moon className="hidden size-4 [html[data-c54-mode='dark']_&]:block" />
    </button>
  );
}