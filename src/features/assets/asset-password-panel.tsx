"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Check, Copy, Dices, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";

import {
  clearDevicePasswordAction,
  generateDevicePasswordAction,
  revealDevicePasswordAction,
  setDevicePasswordAction,
} from "@/features/assets/actions";
import { ConfirmDialog, Dialog, DialogCancelButton } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEVICE_PASSWORD_REQUIREMENT } from "@/lib/auth/device-password-policy";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/** What a masked device password renders as. Length is fixed for generated codes. */
const MASK = "••••••••••••";

/**
 * The device credentials card on an asset's own page.
 *
 * A client island because the whole point is a secret: it appears only on an
 * explicit click, lives in component state rather than in the server-rendered
 * props, and is dropped the moment the card is dismissed. The server sends down
 * `status` — whether a password exists, when it was set and who set it — and
 * nothing else; the value comes back from the reveal action on demand.
 *
 * Only rendered for ADMIN and up. The page decides that from `asset:manage`, and
 * the actions re-check it, so hiding the card is a convenience rather than the
 * control.
 */
export function AssetPasswordPanel({
  assetId,
  status,
}: {
  assetId: string;
  /** From `AssetDto.devicePassword`: presence and provenance, never the value. */
  status: { setAt: string; setBy: string | null } | null;
}) {
  // The plaintext, once something has put it here. `null` means masked, which is
  // also the state the card reopens in — so a password cannot survive on a screen
  // somebody walked away from.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const [revealState, revealAction, revealPending] = useActionState(
    revealDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );
  const [generateState, generateAction, generatePending] = useActionState(
    generateDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );
  const [setState, setAction, setPending] = useActionState(
    setDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );

  // The action results this card has already acted on. Compared by identity, so
  // adoption happens on the render where a result *arrives* and never again —
  // which is what lets Hide stick: a later re-render cannot resurrect the value
  // the user just hid, while the next explicit reveal of that same password
  // comes back as a new result and is adopted like any other.
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
  // already full, say — so hiding a password later never resurrects a result that
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
    const genPw = generateState.data?.password;
    if (generateChanged && genPw) {
      setRevealed(genPw);
    } else if (setChanged && setState.data?.password) {
      setRevealed(setState.data.password);
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
          <CardTitle>Device credentials</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-c54-4">
          <p className="text-c54-xs leading-c54-relaxed text-c54-text-secondary">
            The password this device is protected by, stored encrypted so an admin can read it back
            at any time. Every read is recorded in the audit trail.
          </p>

          {generateState.error ? <Alert tone="danger">{generateState.error}</Alert> : null}

          {status ? (
            <div className="rounded-c54-card border border-c54-border-default bg-c54-bg-muted/50 p-c54-3">
              <div className="flex items-center gap-c54-2 text-c54-2xs text-c54-text-muted">
                <KeyRound aria-hidden="true" className="size-3.5" />
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
            <Alert tone="info" title="No password recorded">
              Nobody has stored a device password for this asset yet. Generate one, or record the
              password the device was configured with.
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
                  Generate password
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

      <ManualPasswordDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        assetId={assetId}
        state={setState}
        action={setAction}
        pending={setPending}
        onSaved={(password) => {
          // Shown straight away rather than forcing a second, audited reveal
          // round trip for a value the operator is already looking at.
          setRevealed(password);
          setManualOpen(false);
        }}
      />

      <ConfirmDialog
        // Closes itself once the action resolves, so a successful forget does not
        // leave a dialog describing a password that no longer exists.
        open={clearOpen && !clearState.ok}
        onClose={() => setClearOpen(false)}
        title="Forget this device password?"
        description={`${assetId} will stop having a stored password. The audit trail keeps the record that one was set, and who set it.`}
        confirmLabel="Forget password"
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
 * Its own dialog rather than an inline field, because generating is the common
 * action on this card and a password box left open on the page invites somebody
 * to type the same password into two assets.
 *
 * The typed value is held in component state and never read back out of
 * `state.values`: `submittedValues` drops any field named like a secret, but a
 * value that never leaves the browser cannot end up in the RSC payload at all.
 */
function ManualPasswordDialog({
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
    /** The trimmed password the action stored; present on success. */
    data?: { password: string };
  };
  action: (formData: FormData) => void;
  pending: boolean;
  onSaved: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const formId = useId();

  // Close on success, in render rather than in an effect. The action returns the
  // trimmed password it stored, and this component holds the last one it has
  // already acknowledged; a success whose value differs is the one to hand up.
  // Comparing values rather than tracking a boolean keeps the acknowledgement
  // correct across a second save of the same password, which a "fires once" flag
  // would silently swallow.
  if (state.ok && state.data && savedPassword !== state.data.password) {
    setSavedPassword(state.data.password);
    // The action echoes the trimmed value, so what gets displayed is what is on
    // the device — an invisible trailing space is otherwise the reason "it says
    // the right password and it is wrong".
    onSaved(state.data.password);
  }
  if (!state.ok && savedPassword !== null) {
    setSavedPassword(null);
  }
  if (!open && password !== "") {
    // Reset the typed value when the dialog is fully dismissed, so reopening it
    // does not show the previous submission as if it were still unsent.
    setPassword("");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set the device password"
      description="Record the password this device was actually configured with."
      size="sm"
      busy={pending}
      footer={
        <>
          <DialogCancelButton />
          <SubmitButton form={formId} pendingLabel="Saving…" pending={pending}>
            Save password
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
          label="Password"
          htmlFor={`${formId}-password`}
          error={state.fieldErrors?.password}
          hint={DEVICE_PASSWORD_REQUIREMENT}
          required
        >
          {(field) => (
            <Input
              {...field}
              name="password"
              // Deliberately `text`, not `password`: the person setting this is
              // reading it off the screen to type into a laptop, and a field
              // that hides what they typed is a field they get wrong.
              type="text"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="font-c54-mono"
            />
          )}
        </Field>

        <p className="text-c54-2xs leading-c54-relaxed text-c54-text-muted">
          Stored encrypted and only ever displayed to admins. Anyone can see that a password exists
          for this asset — nobody but an admin can read it.
        </p>
      </form>
    </Dialog>
  );
}