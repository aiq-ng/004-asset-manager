"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 5000;
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }].slice(-MAX_VISIBLE));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  // Clear pending timers if the provider unmounts mid-countdown.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: "success", title, description }),
      error: (title, description) => toast({ tone: "error", title, description }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-c54-border-default bg-c54-bg-card",
  error: "border-c54-border-danger bg-c54-bg-danger",
  info: "border-c54-border-accent bg-c54-bg-accent",
};

const TONE_ACCENT: Record<ToastTone, string> = {
  success: "bg-c54-status-healthy",
  error: "bg-c54-action-danger",
  info: "bg-c54-action-primary",
};

const TONE_ICON: Record<ToastTone, string> = {
  success: "text-c54-text-success",
  error: "text-c54-text-danger",
  info: "text-c54-text-accent",
};

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-c54-2 p-c54-4 sm:inset-x-auto sm:right-0 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      <ol aria-live="polite" aria-atomic="false" className="flex w-full max-w-sm flex-col gap-c54-2">
        {toasts.map((item) => (
          <li
            key={item.id}
            className={`pointer-events-auto flex animate-rise items-start gap-c54-3 overflow-hidden rounded-c54-card border p-c54-3 shadow-c54-popover ${TONE_STYLES[item.tone]}`}
          >
            <span className={`mt-1 size-2 shrink-0 rounded-c54-full ${TONE_ACCENT[item.tone]}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-c54-sm font-c54-medium ${TONE_ICON[item.tone]}`}>{item.title}</p>
              {item.description ? (
                <p className="mt-c54-1 text-c54-xs text-c54-text-secondary break-words">
                  {item.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="-m-c54-1 rounded-c54-sm p-c54-1 text-c54-text-muted transition-colors hover:bg-c54-action-ghost-hover hover:text-c54-text-primary"
              aria-label={`Dismiss: ${item.title}`}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
