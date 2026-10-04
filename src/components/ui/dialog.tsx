"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export type DialogSize = keyof typeof SIZES;

/** Which edge the panel is anchored to. `center` is a modal dialog; `right` is a sheet. */
export type DialogSide = "center" | "right";

/**
 * Where the panel is in its open/close cycle.
 *
 * `open` exists as its own state so there is room for an exit animation: a
 * native `<dialog>` is closed by the browser the instant you call `close()`, with
 * no transition, so the element has to still be in the top layer while it plays.
 */
type Phase = "closed" | "opening" | "open" | "closing";

/**
 * Longest exit animation, plus slack. `animationend` is the primary signal, but
 * it never fires if the animation is suppressed outright (an extension, an
 * `animation: none` override, an element that never becomes visible), and a
 * dialog stuck in `closing` would be an unclosable overlay. This is the backstop
 * that guarantees it always goes away.
 */
const EXIT_TIMEOUT_MS = 600;

/**
 * The *deferred* close: asks the panel to leave, then runs the caller's `onClose`
 * once the exit animation has finished.
 *
 * A footer Cancel wired straight to the caller's `onClose` tears the element out
 * of the DOM on the same tick as the click, so the exit animation never gets a
 * frame — which is how a Cancel button ends up snapping shut while ESC glides.
 * Context is how the panel and its footer reach the same deferred path.
 *
 * `busy` rides along so the controls in the panel and its footer can lock
 * together. See `Dialog`'s `busy` prop for what that is protecting.
 */
const DialogCloseContext = createContext<{
  /** User-initiated dismissal; refused while `busy`. */
  requestClose: () => void;
  /** Programmatic close after a completed action; ignores `busy`. */
  requestCloseResolved: () => void;
  busy: boolean;
} | null>(null);

function useDialog(): {
  requestClose: () => void;
  requestCloseResolved: () => void;
  busy: boolean;
} {
  const value = useContext(DialogCloseContext);

  if (!value) {
    throw new Error("Dialog controls must be rendered inside a <Dialog>");
  }

  return value;
}

/**
 * The footer Cancel button.
 *
 * A component rather than a hook on purpose: the footer is authored by whoever
 * renders the `Dialog`, so a hook called in that component's body would run
 * *outside* the provider. React context follows render position, so this button
 * has to be rendered inside the panel for the lookup to resolve.
 */
export function DialogCancelButton({
  children = "Cancel",
  ...props
}: { children?: React.ReactNode } & Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "children"
>) {
  const { requestClose, busy } = useDialog();

  // Locked while `busy`, unless the caller has explicitly said otherwise: a
  // dismissal during an in-flight mutation closes the panel over a request that
  // is still running, and the operator loses sight of its result.
  return (
    // `{...props}` first for the same reason as `SubmitButton`: spread last
    // would let a caller's `disabled` overwrite the busy lock.
    <Button {...props} variant="outline" onClick={requestClose} disabled={busy || props.disabled}>
      {children}
    </Button>
  );
}

/**
 * Modal dialog built on the native `<dialog>` element.
 *
 * Using the platform primitive means the browser supplies the top layer, the
 * backdrop, and inertness of the rest of the page for free — both less code and
 * more correct than simulating it with `z-index`. Everything here is
 * progressive enhancement on top of that.
 *
 * `side="right"` swaps the centred modal for a full-height sheet that slides in
 * from the right edge. It is the same primitive with different geometry, so it
 * keeps the top layer, ESC handling, focus restoration and the backdrop click —
 * none of which a hand-rolled side panel gets for free.
 *
 * `onClose` is deferred until the exit animation has finished, so callers can
 * keep this mounted for the duration or unmount it on close — either way the
 * animation gets to run. That is what lets the trigger components stay as simple
 * as `{open ? <Sheet /> : null}`.
 *
 * `busy` says a mutation inside the panel is in flight. It disables the footer
 * Cancel and the header close button, and makes ESC and a backdrop click no-ops,
 * so a half-submitted form cannot be dismissed out from under itself. Callers
 * get it from the third element of `useActionState`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  side = "center",
  className,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: DialogSize;
  side?: DialogSide;
  className?: string;
  /** Disables every dismissal path while a mutation is in flight. */
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [phase, setPhase] = useState<Phase>(open ? "open" : "closed");

  // Both of these are read from effects and event handlers, never during render,
  // and callers routinely pass an inline arrow. Holding them in refs keeps them
  // out of effect dependency lists that would otherwise re-run on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Two distinct close paths, and the difference matters.
  //
  // `requestClose` is a *user* dismissal — Cancel, the X, ESC, the backdrop.
  // While a mutation is in flight those are dropped: the request would otherwise
  // land the moment the action resolves, closing a panel the operator may have
  // already been looking past.
  //
  // `requestCloseResolved` is the programmatic close a completed action asks for,
  // and it deliberately ignores `busy`. `pending` is still true on the render
  // where the action's success state first appears — React settles the two in
  // the same commit — so a shared guard would refuse the close that the success
  // path exists to perform, and the sheet would sit there for good. That is not
  // hypothetical: it is what this pair was written to fix.
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const closeNow = useCallback(() => {
    setPhase((current) => (current === "open" || current === "opening" ? "closing" : current));
  }, []);

  const requestClose = useCallback(() => {
    if (busyRef.current) return;
    closeNow();
  }, [closeNow]);

  // Prop changes drive the machine — but only *changes*. A dialog mounted
  // conditionally by its caller passes a literal `open` and never changes it, and
  // without this guard the internal close would immediately re-open itself.
  const lastOpen = useRef(open);
  useEffect(() => {
    if (open === lastOpen.current) return;
    lastOpen.current = open;
    setPhase((current) => {
      if (open) return current === "closed" || current === "closing" ? "opening" : current;
      return current === "closed" || current === "closing" ? current : "closing";
    });
  }, [open]);

  // Drive the native element, and finish the exit when the animation reports in.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (phase === "open" || phase === "opening") {
      if (!node.open) node.showModal();
      return;
    }

    if (phase === "closing") {
      const finish = () => {
        clearTimeout(timer);
        node.removeEventListener("animationend", finish);
        if (node.open) node.close();
        setPhase("closed");
        // Deferred until now: callers unmount on close, so calling this earlier
        // would tear the element out mid-animation.
        onCloseRef.current();
      };

      // Both signals are live at once. `animationend` is the one that normally
      // wins; the timeout exists because an animation that never runs — suppressed
      // by `prefers-reduced-motion`, a stylesheet override, an extension — fires
      // no event at all, and a dialog stuck in `closing` is an unclosable overlay.
      const timer = setTimeout(finish, EXIT_TIMEOUT_MS);
      node.addEventListener("animationend", finish);

      return () => {
        clearTimeout(timer);
        node.removeEventListener("animationend", finish);
      };
    }

    // `closed`: the portal is about to disappear, so take the element out of the
    // top layer explicitly rather than leaving the UA to notice the removal.
    if (node.open) node.close();
  }, [phase]);

  // ESC and the platform's own light-dismiss both arrive as `cancel`. The default
  // would close the element immediately and skip the exit animation, so it is
  // suppressed and the request is routed through the same path as the backdrop.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      requestClose();
    };

    node.addEventListener("cancel", handleCancel);
    return () => node.removeEventListener("cancel", handleCancel);
  }, [requestClose]);

  // A click landing on the <dialog> element itself came from the backdrop.
  //
  // The sheet is anchored flush to the right edge and stretched to the full
  // viewport height, so there is no gutter for a stray click to land in; a click
  // on the <dialog> can only be the backdrop there. The centred variant keeps the
  // same rule, where the panel is inset on every side and its own children
  // intercept the clicks that are actually meant for it.
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === ref.current) requestClose();
    },
    [requestClose],
  );

  // The backdrop is a pseudo-element, so it cannot be given its own fade-out
  // animation. Hiding it with the panel and letting it disappear in one step at
  // the very end reads as the dimming lifting as the sheet clears it.
  //
  // `if (phase === "closed") return null` is a hard guarantee that nothing is
  // mounted when the dialog is shut, on the server as well as the client.
  // Returning `null` from a `typeof document === "undefined"` branch instead
  // would make the server render an empty tree while the client renders a portal
  // — a guaranteed hydration mismatch, and one per row on a list page, because
  // the error is reported for every dialog on the page.
  if (phase === "closed") return null;

  const isSheet = side === "right";
  const closing = phase === "closing";

  // Swapped rather than combined: the `open:` variant compiles to a higher
  // specificity than a bare `animate-*`, so leaving both on would let the
  // entrance animation win and the exit would never run.
  const motion = closing
    ? isSheet
      ? "animate-sheet-out-right"
      : "animate-sheet-out"
    : isSheet
      ? "open:animate-sheet-in-right"
      : "open:animate-sheet-in";

  return createPortal(
    <DialogCloseContext.Provider value={{ requestClose, requestCloseResolved: closeNow, busy }}>
    <dialog
      ref={ref}
      onClick={handleClick}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "bg-transparent p-0 text-c54-text-primary",
        "backdrop:bg-c54-bg-inverse/55 backdrop:backdrop-blur-[2px]",
        motion,
        // Still on screen, no longer answering input: the sheet has been asked to
        // go and a second click on the backdrop should not queue another close.
        closing && "pointer-events-none",
        isSheet
          ? // `inset-y-0` plus `right-0` stretches the top-layer dialog to the
            // full viewport height flush against the edge. The width is capped so
            // the register behind it stays visible enough to read as context.
            "inset-y-0 right-0 left-auto top-0 m-0 h-dvh max-h-dvh w-full max-w-[34rem]"
          : cn(
              "m-auto w-[calc(100vw-2rem)] max-h-[calc(100dvh-3rem)]",
              SIZES[size],
            ),
        className,
      )}
    >
      {/* The panel carries the radius on the centred variant only: a sheet is a
          full-height surface, and rounding its corners would leave the backdrop
          visible at the top-right and bottom-right where it meets the edge. */}
      <div
        className={cn(
          "flex flex-col overflow-hidden border-c54-border-default bg-c54-bg-card",
          isSheet
            ? "h-full border-l shadow-c54-dialog"
            : "max-h-[calc(100dvh-3rem)] rounded-c54-card border shadow-c54-dialog",
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-c54-4 border-b border-c54-border-default px-c54-pad-lg py-c54-pad">
          <div className="min-w-0">
            <h2 id={titleId} className="text-c54-base font-c54-semibold text-c54-text-primary">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-c54-1 text-c54-xs text-c54-text-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <DialogCloseButton onClose={requestClose} disabled={busy} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-c54-pad-lg py-c54-pad">{children}</div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-c54-2 border-t border-c54-border-default bg-c54-bg-muted/40 px-c54-pad-lg py-c54-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
    </DialogCloseContext.Provider>,
    document.body,
  );
}

/**
 * Asks the dialog to close when `when` becomes true.
 *
 * For Server Actions that resolve without a redirect, where the form is done and
 * the sheet should go, but `onClose` must not be called straight from the
 * action's own effect: that unmounts the dialog on the same tick and the exit
 * animation is skipped. Going through the dialog means the sheet slides away and
 * the parent's `onClose` — which is what resets `useActionState` for the next
 * open — still runs.
 *
 * Render it inside the panel; like `DialogCancelButton` it has to be positioned
 * within the provider to reach the context.
 */
export function DialogCloseOnSuccess({ when }: { when: boolean }) {
  // `requestCloseResolved`, not `requestClose`: the action's own success is
  // exactly the moment `pending` is still true, so the busy guard meant for user
  // dismissals would refuse this and strand the sheet open.
  const { requestCloseResolved } = useDialog();

  useEffect(() => {
    if (when) requestCloseResolved();
  }, [when, requestCloseResolved]);

  return null;
}

export function DialogCloseButton({
  onClose,
  disabled = false,
}: {
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      disabled={disabled}
      className="-m-c54-2 shrink-0 rounded-c54-sm p-c54-2 text-c54-text-muted transition-colors hover:bg-c54-action-ghost-hover hover:text-c54-text-primary disabled:pointer-events-none disabled:opacity-45"
      aria-label="Close dialog"
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </button>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: ButtonVariant;
  /**
   * Server Action invoked with the dialog's own form data.
   *
   * This is the `useActionState` *dispatch*, not the raw action: React finds the
   * pending-state plumbing through a `$$FORM_ACTION` property on the function it
   * is given, so it has to be handed the dispatch straight from `useActionState`
   * rather than a wrapper. The state it produces is read by the caller, which is
   * what renders validation errors inline.
   */
  action: (formData: FormData) => void;
  /** Hidden inputs, e.g. the id of the row being retired. */
  fields?: Record<string, string>;
  children?: React.ReactNode;
}

/**
 * Confirmation dialog for irreversible or consequential actions.
 *
 * The confirm control is a real submit inside a real `<form action>`, so the
 * mutation stays a Server Action with progressive enhancement rather than a
 * click handler that fetches.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  variant = "danger",
  action,
  fields,
  children,
}: ConfirmDialogProps) {
  const formId = useId();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <DialogCancelButton />
          <Button type="submit" form={formId} variant={variant}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} action={action}>
        {Object.entries(fields ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {children}
      </form>
    </Dialog>
  );
}
