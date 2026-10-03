"use client";

import { changePasswordAction } from "@/features/settings/actions";
import { ChangePasswordForm } from "@/features/settings/change-password-form";
import {
  useSystemPrefersDark,
  useThemeMode,
  type ThemePreference,
} from "@/components/providers/theme-mode-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

const MODES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Always light, ignoring your system setting." },
  { value: "system", label: "System", hint: "Follow the operating system preference." },
  { value: "dark", label: "Dark", hint: "Always dark, ignoring your system setting." },
];

/**
 * Appearance and password.
 *
 * Both are per-browser or per-account, which is why they live here rather than in
 * a server-backed preferences store: the theme is stored in `localStorage` and
 * applied before first paint, and a password change is a credential operation the
 * service owns outright.
 */
export function SettingsPanels({
  email,
  hasPassword,
}: {
  email: string;
  /** An account created without a password may skip the current-password check. */
  hasPassword: boolean;
}) {
  return (
    <div className="grid gap-c54-section lg:grid-cols-2">
      <AppearanceCard />
      <ChangePasswordCard email={email} hasPassword={hasPassword} />
    </div>
  );
}

function AppearanceCard() {
  const { preference, setPreference } = useThemeMode();
  // The server cannot know the OS preference, so this reads "false" while
  // hydrating and adopts the real value straight after.
  const systemPrefersDark = useSystemPrefersDark();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-c54-4">
        <fieldset className="flex flex-col gap-c54-2">
          <legend className="text-c54-2xs font-c54-semibold tracking-c54-widest text-c54-text-muted uppercase">
            Colour mode
          </legend>

          <div className="grid grid-cols-3 gap-c54-2">
            {MODES.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-c54-2 rounded-c54-card border p-c54-3 text-center transition-colors",
                  preference === option.value
                    ? "border-c54-action-primary bg-c54-action-primary/5"
                    : "border-c54-border-default hover:border-c54-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="theme-mode"
                  value={option.value}
                  checked={preference === option.value}
                  onChange={() => setPreference(option.value)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-8 items-center justify-center rounded-c54-full border",
                    option.value === "light"
                      ? "border-c54-border-default bg-c54-bg-card text-c54-text-primary"
                      : option.value === "dark"
                        ? "border-white/15 bg-c54-bg-inverse text-white"
                        : "border-c54-border-default bg-c54-bg-muted text-c54-text-secondary",
                  )}
                >
                  {option.value === "light" ? (
                    <Icons.Sun className="size-4" />
                  ) : option.value === "dark" ? (
                    <Icons.Moon className="size-4" />
                  ) : (
                    <Icons.Settings className="size-4" />
                  )}
                </span>
                <span className="text-c54-2xs font-c54-medium text-c54-text-primary">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <p className="text-c54-2xs text-c54-text-muted">
          {MODES.find((option) => option.value === preference)?.hint}
          {preference === "system" ? (
            <>
              {" "}
              Your system currently prefers{" "}
              <span className="font-c54-medium text-c54-text-secondary">
                {systemPrefersDark ? "dark" : "light"}
              </span>
              .
            </>
          ) : null}
        </p>

        <p className="border-t border-c54-border-default pt-c54-3 text-c54-2xs text-c54-text-muted">
          Stored in this browser only. Clearing site data resets it to the system default.
        </p>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <ChangePasswordForm email={email} hasPassword={hasPassword} action={changePasswordAction} />
      </CardContent>
    </Card>
  );
}