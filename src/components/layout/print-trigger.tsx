"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";

/**
 * Fires the print dialog once the label has laid out.
 *
 * Printing from the Server Component directly opens the dialog before the browser
 * has settled the layout, which on some browsers produces a blank page — hence
 * the small client island and the short delay. The fallback button stays on screen
 * so a user who dismissed the dialog can still print.
 */
export function PrintTrigger() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="c54-no-print mb-c54-section flex flex-wrap items-center justify-between gap-c54-4">
      <p className="text-c54-sm text-c54-text-secondary">
        Choose landscape and fit-to-page in the print dialog, and turn off headers and footers.
      </p>
      <Button size="sm" onClick={() => window.print()}>
        <Icons.Printer className="size-3.5" />
        Print label
      </Button>
    </div>
  );
}