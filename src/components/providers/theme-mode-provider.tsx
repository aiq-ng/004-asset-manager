"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * Light/dark mode for the `@c54/tokens` theme system.
 *
 * The token package scopes every custom property to `[data-c54-theme]` plus an
 * optional `data-c54-mode`, so switching modes is a single attribute write on
 * `<html>` — no stylesheet swap and no re-render of the tree.
 *
 * The attributes on `<html>` are treated as the external store and read through
 * `useSyncExternalStore` rather than mirrored into React state. That is what keeps
 * the server render (always light) and the client render (whatever the pre-paint
 * bootstrap script chose) from fighting: React uses the server snapshot while
 * hydrating, then adopts the real value immediately afterwards without a mismatch
 * warning, and no effect is needed to copy a value into state.
 *
 * Two attributes are kept:
 *   - `data-c54-mode`   the *resolved* mode, "light" or "dark"; what CSS reads;
 *   - `data-c54-pref`   the *preference*, which may be "system".
 * The split is what lets the settings page show "System" as selected while still
 * rendering dark, and lets an OS theme change re-resolve the mode with no
 * React involvement.
 */

/** The mode actually applied to the document. */
export type ThemeMode = "light" | "dark";
/** What the user chose; `"system"` defers to the operating system. */
export type ThemePreference = ThemeMode | "system";

const STORAGE_KEY = "inv-cat-theme-mode";
const MODE_ATTRIBUTE = "data-c54-mode";
const PREFERENCE_ATTRIBUTE = "data-c54-pref";

interface ThemeModeContextValue {
  /** The preference the user chose, which may be `"system"`. */
  preference: ThemePreference;
  /** The mode applied right now. */
  mode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

/** Subscribers are notified by `writePreference` below, and by other tabs via `storage`. */
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  function handleStorage(event: StorageEvent) {
    if (event.key === STORAGE_KEY || event.key === null) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function readModeAttribute(): ThemeMode {
  return document.documentElement.getAttribute(MODE_ATTRIBUTE) === "dark" ? "dark" : "light";
}

function readPreferenceAttribute(): ThemePreference {
  const value = document.documentElement.getAttribute(PREFERENCE_ATTRIBUTE);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function systemMode(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Applies a preference to the document.
 *
 * This is the only writer, which is what keeps the two attributes consistent: the
 * preference is stored even when the resolved mode is unchanged, so reloading
 * still restores the user's choice.
 */
function writePreference(next: ThemePreference) {
  const resolved = next === "system" ? systemMode() : next;
  const root = document.documentElement;

  root.setAttribute(PREFERENCE_ATTRIBUTE, next);
  root.setAttribute(MODE_ATTRIBUTE, resolved);

  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Blocked or full storage. The attributes are what actually render, so
    // failing to persist is not worth surfacing.
  }

  for (const listener of listeners) listener();
}

/**
 * Whether the operating system currently prefers a dark UI.
 *
 * Exported so the settings page can tell the user what "System" resolves to
 * instead of showing a blank. The server snapshot is `false`; the real value is
 * adopted immediately after hydration.
 */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    subscribeToColorScheme,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
}

function subscribeToColorScheme(onStoreChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribe, readModeAttribute, () => "light" as const);
  const preference = useSyncExternalStore(
    subscribe,
    readPreferenceAttribute,
    () => "system" as const,
  );

  // While the preference is "system", an OS theme change has to re-resolve the
  // mode attribute. Subscribing here — rather than at module scope — means the
  // listener exists only while a component is mounted, and routing the update
  // through `writePreference` keeps the stored preference at "system".
  useEffect(() => {
    if (preference !== "system") return;
    return subscribeToColorScheme(() => writePreference("system"));
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => writePreference(next), []);
  const setMode = useCallback((next: ThemeMode) => setPreference(next), [setPreference]);
  const toggle = useCallback(
    () => writePreference(readModeAttribute() === "dark" ? "light" : "dark"),
    [],
  );

  const value = useMemo(
    () => ({ preference, mode, setPreference, setMode, toggle }),
    [preference, mode, setPreference, setMode, toggle],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error("useThemeMode must be used inside <ThemeModeProvider>");
  return context;
}

/**
 * Inlined into `<head>` by the root layout. Runs before the first paint so the
 * correct mode is on `<html>` before any tokenised style is applied.
 */
export const themeModeBootstrapScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var p=(s==="light"||s==="dark"||s==="system")?s:"system";var d=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=document.documentElement;r.setAttribute(${JSON.stringify(PREFERENCE_ATTRIBUTE)},p);r.setAttribute(${JSON.stringify(MODE_ATTRIBUTE)},p==="system"?d:p);}catch(e){var r=document.documentElement;r.setAttribute(${JSON.stringify(PREFERENCE_ATTRIBUTE)},"system");r.setAttribute(${JSON.stringify(MODE_ATTRIBUTE)},"light");}})();`;