"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Check, Copy, Dices, Eye, EyeOff, Hash, Trash2 } from "lucide-react";

import {
  clearDevicePinAction,
  generateDevicePinAction,
  revealDevicePinAction,
  setDevicePinAction,
} from "@/features/assets/actions";
import { ConfirmDialog, Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEVICE_PIN_LENGTH, DEVICE_PIN_REQUIREMENT } from "@/lib/auth/device-pin-policy";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/** What a masked device PIN renders as. Length matches `DEVICE_PIN_LENGTH`. */
const MASK = "•".repeat(DEVICE_PIN_LENGTH);

/**
 * The device PIN card on an asset's own page.
 *
 * The counterpart to `asset-password-panel.tsx`, and deliberately the same shape
 * of client island: the whole point is a secret, so the value appears only on an
 * explicit click, lives in component state rather than in the server-rendered
 * props, and is dropped the moment the card is dismissed. The server sends down
 * `status` — whether a PIN exists, when it was set and who set it — and nothing
 * else; the value comes back from the reveal action on demand.
 *
 * It is a separate card rather than a second block inside the password one
 * because the two are independent credentials: either can be set, regenerated or
 * forgotten without touching the other, and one card with two halves would have
 * two sets of pending flags, two masks and two "cleared" states fighting over one
 * layout.
 *
 * Only rendered for ADMIN and up. The page decides that from `asset:manage`, and
 * the actions re-check it, so hiding the card is a convenience rather than the
 * control.
 */
export function AssetPinPanel({
  assetId,
  status,
}: {
  assetId: string;
  /** From `AssetDto.devicePin`: presence and provenance, never the value. */
  status: { setAt: string; setBy: string | null } | null;
}) {
  // The plaintext, once something has put it here. `null` means masked, which is
  // also the state the card reopens in — so a PIN cannot survive on a screen
  // somebody walked away from.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const [revealState, revealAction, revealPending] = useActionState(
    revealDevicePinAction,
    INITIAL_ACTION_STATE,
  );
  const [generateState, generateAction, generatePending] = useActionState(
    generateDevicePinAction,
    INITIAL_ACTION_STATE,
  );
  const [setState, setAction, setPending] = useActionState(
    setDevicePinAction,
    INITIAL_ACTION_STATE,
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearDevicePinAction,
    INITIAL_ACTION_STATE,
  );

  // The action results this card has already acted on. Compared by identity, so
  // adoption happens on the render where a result *arrives* and never again —
  // which is what lets Hide stick: a later re-render cannot resurrect the value
  // the user just hid, while the next explicit reveal of that same PIN comes
  // back as a new result and is adopted like any other.
  const [seen, setSeen] = useState({
    reveal: revealState,
    generate: generateState,
    set: setState,
  });

  // The copied tick expires on its own, so the icon does not sit there claiming
  // a copy that happened a minute ago.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Render-phase adoption of a freshly returned value. Generate, manual set and
  // reveal all land the new value here, so there is one place that holds a
  // plaintext and one thing to clear. Clear takes priority: once the clear action
  // has succeeded the plaintext is dropped and cannot be re-adopted from a
  // generate, set or reveal result that has not yet been flushed by the page
  // refresh.
  //
  // Results are marked seen even when they are passed over — because the slot is
  // already full, say — so hiding a PIN later never resurrects a result that
  // arrived while it was showing.
  const revealChanged = seen.reveal !== revealState;
  const generateChanged = seen.generate !== generateState;
  const setChanged = seen.set !== setState;
  if (revealChanged || generateChanged || setChanged) {
    setSeen({ reveal: revealState, generate: generateState, set: setState });
  }

  if (clearState.ok) {
    if (revealed !== null) setRevealed(null);
  } else if (revealed === null) {
    const genPin = generateState.data?.pin;
    if (generateChanged && genPin) {
      setRevealed(genPin);
    } else if (setChanged && setState.data?.pin) {
      setRevealed(setState.data.pin);
    } else if (revealChanged && revealState.data) {
      setRevealed(revealState.data);
    }
  }

  async function copy() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
  }

  const busy = revealPending || generatePending || setPending || clearPending;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Device PIN</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-c54-4">
          <p className="text-c54-xs leading-c54-relaxed text-c54-text-secondary">
            The code this device is unlocked with, stored in plain text so an admin can read it
            back at any time. Every read is recorded in the audit trail.
          </p>

          {generateState.error ? <Alert tone="danger">{generateState.error}</Alert> : null}

          {status ? (
            <div className="rounded-c54-card border border-c54-border-default bg-c54-bg-muted/50 p-c54-3">
              <div className="flex items-center gap-c54-2 text-c54-2xs text-c54-text-muted">
                <Hash aria-hidden="true" className="size-3.5" />
                <span>
                  Set {formatSetAt(status.setAt)}
                  {status.setBy ? ` by ${status.setBy}` : ""}
                </span>
              </div>

              <div className="mt-c54-3 flex flex-wrap items-center gap-c54-2">
                <code
                  className="shrink-0 rounded-c54-input border border-c54-border-default bg-c54-bg-card px-c54-3 py-c54-2 font-c54-mono text-c54-sm text-c54-text-primary whitespace-nowrap truncate"
                  // Announced so a reveal is not a silent change for anyone using
                  // a screen reader.
                  aria-live="polite"
                >
                  {revealed ?? MASK}
                </code>

                {revealed ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setRevealed(null)}>
                      <EyeOff aria-hidden="true" className="size-3.5" />
                      Hide
                    </Button>
                    <Button variant="outline" size="sm" onClick={copy}>
                      {copied ? (
                        <Check aria-hidden="true" className="size-3.5 text-c54-action-success" />
                      ) : (
                        <Copy aria-hidden="true" className="size-3.5" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </>
                ) : (
                  <form action={revealAction} className="contents">
                    <input type="hidden" name="assetId" value={assetId} />
                    <SubmitButton
                      variant="outline"
                      size="sm"
                      pendingLabel="Reading…"
                      pending={revealPending}
                      disabled={busy}
                    >
                      <Eye aria-hidden="true" className="size-3.5" />
                      Reveal
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <Alert tone="info" title="No PIN recorded">
              Nobody has stored a device PIN for this asset yet. Generate one, or record the PIN
              the device was configured with.
            </Alert>
          )}

          {revealState.error ? <Alert tone="danger">{revealState.error}</Alert> : null}

          <div className="flex flex-wrap gap-c54-2 border-t border-c54-border-default pt-c54-4">
            {!status && (
              <form action={generateAction} className="contents">
                <input type="hidden" name="assetId" value={assetId} />
                <SubmitButton
                  variant="primary"
                  size="md"
                  pendingLabel="Generating…"
                  disabled={busy}
                >
                  <Dices aria-hidden="true" className="size-4" />
                  Generate PIN
                </SubmitButton>
              </form>
            )}

            <Button variant="outline" size="md" disabled={busy} onClick={() => setManualOpen(true)}>
              Set my own
            </Button>

            {status ? (
              <Button
                variant="ghost"
                size="md"
                disabled={busy}
                onClick={() => setClearOpen(true)}
                className="text-c54-action-danger hover:bg-c54-bg-danger"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Forget
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ManualPinDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        assetId={assetId}
        state={setState}
        action={setAction}
        pending={setPending}
        onSaved={(pin) => {
          // Shown straight away rather than forcing a second, audited reveal
          // round trip for a value the operator is already looking at.
          setRevealed(pin);
          setManualOpen(false);
        }}
      />

      <ConfirmDialog
        // Closes itself once the action resolves, so a successful forget does not
        // leave a dialog describing a PIN that no longer exists.
        open={clearOpen && !clearState.ok}
        onClose={() => setClearOpen(false)}
        title="Forget this device PIN?"
        description={`${assetId} will stop having a stored PIN. The audit trail keeps the record that one was set, and who set it.`}
        confirmLabel="Forget PIN"
        action={clearAction}
        fields={{ assetId }}
      >
        {clearState.error ? <Alert tone="danger">{clearState.error}</Alert> : null}
      </ConfirmDialog>
    </>
  );
}

/** "12 Mar 2026" — the same shape the rest of the detail page prints. */
function formatSetAt(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The "set it myself" form.
 *
 * Its own dialog rather than an inline field, for the same reason the password's
 * is: generating is the common action on this card, and an open code box invites
 * somebody to type the same PIN into two assets.
 *
 * The typed value is held in component state and never read back out of
 * `state.values` — and `submittedValues` drops any field named like a secret as
 * well, so a failed submit cannot echo it into the response either.
 */
function ManualPinDialog({
  open,
  onClose,
  assetId,
  state,
  action,
  pending,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  state: {
    ok: boolean;
    error: string;
    message?: string;
    fieldErrors?: Record<string, string>;
    /** The trimmed PIN the action stored; present on success. */
    data?: { pin: string };
  };
  action: (formData: FormData) => void;
  pending: boolean;
  onSaved: (pin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const formId = useId();

  // Close on success, in render rather than in an effect. The action returns the
  // trimmed PIN it stored, and this component holds the last one it has already
  // acknowledged; a success whose value differs is the one to hand up.
  if (state.ok && state.data && savedPin !== state.data.pin) {
    setSavedPin(state.data.pin);
    onSaved(state.data.pin);
  }
  if (!state.ok && savedPin !== null) {
    setSavedPin(null);
  }
  if (!open && pin !== "") {
    // Reset the typed value when the dialog is fully dismissed, so reopening it
    // does not show the previous submission as if it were still unsent.
    setPin("");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set the device PIN"
      description="Record the PIN this device was actually configured with."
      size="sm"
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form={formId} pendingLabel="Saving…" pending={pending}>
            Save PIN
          </SubmitButton>
        </>
      }
    >
      <form id={formId} action={action} className="flex flex-col gap-c54-4">
        <input type="hidden" name="assetId" value={assetId} />

        {state.ok ? (
          <Alert tone="success">{state.message || "Saved."}</Alert>
        ) : state.error ? (
          <Alert tone="danger">{state.error}</Alert>
        ) : null}

        <Field
          label="PIN"
          htmlFor={`${formId}-pin`}
          error={state.fieldErrors?.pin}
          hint={DEVICE_PIN_REQUIREMENT}
          required
        >
          {(field) => (
            <Input
              {...field}
              name="pin"
              // Deliberately `text`, not `password`: the person setting this is
              // reading it off the screen to type into a device, and a field
              // that hides what they typed is a field they get wrong. The
              // numeric keypad is what a phone shows for `inputMode="numeric"`,
              // which is where most of these get typed.
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={DEVICE_PIN_LENGTH}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="font-c54-mono"
            />
          )}
        </Field>

        <p className="text-c54-2xs leading-c54-relaxed text-c54-text-muted">
          Stored in plain text and only ever displayed to admins. Anyone can see that a PIN exists
          for this asset — nobody but an admin can read it.
        </p>
      </form>
    </Dialog>
  );
}
