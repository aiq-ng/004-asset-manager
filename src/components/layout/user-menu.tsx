"use client";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import { logoutAction } from "@/features/auth/actions";
import type { StaffRole } from "@/generated/prisma/client";

/**
 * Account menu.
 *
 * Sign-out posts a Server Action from inside the menu rather than navigating to
 * a route, because logging out bumps `sessionVersion` — it is a mutation, not a
 * page, and going through the action keeps one implementation of it.
 */
export function UserMenu({
  name,
  email,
  department,
  role,
}: {
  name: string;
  email: string;
  department: string;
  role: StaffRole;
}) {
  return (
    <DropdownMenu
      align="end"
      trigger={(trigger) => (
        <button
          type="button"
          id={trigger.id}
          onClick={trigger.toggle}
          aria-haspopup={trigger["aria-haspopup"]}
          aria-expanded={trigger["aria-expanded"]}
          className="flex items-center gap-c54-2 rounded-c54-button py-c54-1 pr-c54-2 pl-c54-1 transition-colors hover:bg-c54-action-ghost-hover"
        >
          <Avatar name={name} />
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-40 truncate text-c54-xs font-c54-semibold text-c54-text-primary">
              {name}
            </span>
            <span className="block max-w-40 truncate text-c54-2xs text-c54-text-muted">{department}</span>
          </span>
          <Icons.ChevronRight className="size-3 rotate-90 text-c54-text-muted" />
        </button>
      )}
    >
      <DropdownLabel>Signed in</DropdownLabel>
      <div className="px-c54-3 pb-c54-2">
        <p className="truncate text-c54-xs font-c54-semibold text-c54-text-primary">{name}</p>
        <p className="truncate text-c54-2xs text-c54-text-muted">{email}</p>
        <Badge tone="info" size="sm" className="mt-c54-2">
          {role}
        </Badge>
      </div>
      <DropdownSeparator />
      <DropdownItem href="/settings">
        <Icons.User className="size-3.5" />
        Account &amp; appearance
      </DropdownItem>
      <DropdownSeparator />
      {/* A submit button inside the menu, so sign-out is one progressive-enhancement
          form rather than a click handler that only exists after hydration. */}
      <form action={logoutAction}>
        <DropdownItem type="submit" danger>
          <Icons.Logout className="size-3.5" />
          Sign out
        </DropdownItem>
      </form>
    </DropdownMenu>
  );
}