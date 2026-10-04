"use client";

import { useState } from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { ShieldCheck, User } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { DescriptionList, DetailRow } from "@/components/ui/table";
import { StaffRoleBadge } from "@/features/staff/staff-role-badge";
import { rolePresentation } from "@/features/staff/role-presentation";
import { ChangePasswordForm } from "@/features/settings/change-password-form";
import type { StaffRole } from "@/generated/prisma/client";

/**
 * Sidebar account section.
 *
 * Replaces the old Settings nav entry: the signed-in user's identity sits at
 * the foot of the sidebar, and a switch opens a small panel with the two
 * things Settings used to hold — change password and account details — each in
 * its own modal.
 */
export function SidebarUserSection({
  actor,
  hasPassword,
}: {
  actor: { name: string; email: string; department: string; role: StaffRole };
  hasPassword: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modal, setModal] = useState<"password" | "account" | null>(null);
  const presentation = rolePresentation(actor.role);
  const SwitchIcon = settingsOpen ? ToggleRight : ToggleLeft;

  return (
    <div className="relative">
      {settingsOpen ? (
        <>
          {/* Catches outside clicks so the panel closes like a menu. */}
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 bottom-full left-0 z-50 mb-c54-2 overflow-hidden rounded-c54-card border border-c54-border-default bg-c54-bg-card shadow-c54-dialog">
            <p className="border-b border-c54-border-default px-c54-pad py-c54-3 text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase">
              Settings
            </p>
            <div className="flex flex-col p-c54-1">
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setModal("password");
                }}
                className="flex items-center gap-c54-3 rounded-c54-button px-c54-3 py-c54-2 text-left text-c54-sm text-c54-text-secondary transition-colors hover:bg-c54-action-ghost-hover hover:text-c54-text-primary"
              >
                <ShieldCheck className="size-4 text-c54-text-muted" />
                Change password
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setModal("account");
                }}
                className="flex items-center gap-c54-3 rounded-c54-button px-c54-3 py-c54-2 text-left text-c54-sm text-c54-text-secondary transition-colors hover:bg-c54-action-ghost-hover hover:text-c54-text-primary"
              >
                <User className="size-4 text-c54-text-muted" />
                Account details
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="flex items-center gap-c54-2 border-t border-c54-border-default px-c54-pad py-c54-3">
        <Avatar name={actor.name} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-c54-xs font-c54-semibold text-c54-chrome-fg">
            {actor.name}
          </span>
          <span className="block truncate text-c54-2xs text-c54-chrome-fg/60">
            {actor.department}
          </span>
        </span>
        <ThemeToggle tone="inverse" />
        <button
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-label="Settings"
          className="inline-flex size-8 items-center justify-center rounded-c54-sm text-c54-chrome-fg/80 transition-colors duration-c54-fast hover:bg-c54-bg-inverse/15 hover:text-c54-chrome-fg"
        >
          <SwitchIcon className="size-4" />
        </button>
      </div>

      <Dialog
        open={modal === "password"}
        onClose={() => setModal(null)}
        title="Change password"
        description={actor.email}
      >
        <ChangePasswordForm email={actor.email} hasPassword={hasPassword} closeOnSuccess />
      </Dialog>

      <Dialog
        open={modal === "account"}
        onClose={() => setModal(null)}
        title="Account details"
        description="Your identity and what this role can do."
      >
        <DescriptionList>
          <DetailRow term="Name">{actor.name}</DetailRow>
          <DetailRow term="Email">{actor.email}</DetailRow>
          <DetailRow term="Department">{actor.department}</DetailRow>
          <DetailRow term="Role">
            <StaffRoleBadge role={actor.role} />
          </DetailRow>
          <DetailRow term="What you can do">
            <span className="text-c54-xs text-c54-text-secondary">{presentation.summary}</span>
          </DetailRow>
          <DetailRow term="Password">
            {hasPassword ? (
              "Set. Change it above."
            ) : (
              <span className="text-c54-text-warning">
                Not set. Set one above to sign in again later.
              </span>
            )}
          </DetailRow>
        </DescriptionList>
      </Dialog>
    </div>
  );
}
