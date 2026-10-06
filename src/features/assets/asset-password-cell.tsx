"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, Dices, Eye, EyeOff, Trash2 } from "lucide-react";

import {
  clearDevicePasswordAction,
  generateDevicePasswordAction,
  revealDevicePasswordAction,
} from "@/features/assets/actions";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { INITIAL_ACTION_STATE } from "@/lib/server/action-state";

/**
 * One register row's device password.
 *
 * The compact counterpart to the credentials card on the asset page: reveal,
 * copy, generate, forget — everything that fits in a table cell, and nothing
 * else. The point of having it here is that "which laptop has the password I
 * need?" should not require opening twenty detail pages.
 *
 * The set-it-yourself path is deliberately absent. It needs a labelled field and
 * a typed value, which does not belong in a cell, and the card one click away is
 * where it lives.
 *
 * Rendered only for ADMIN and up. The register passes the flag from
 * `asset:manage`; the actions check it again, so the column is not the control.
 */
export function AssetPasswordCell({
  assetId,
  hasPassword,
}: {
  assetId: string;
  /** From `AssetDto.devicePassword`; `false` renders the bare "Generate" action. */
  hasPassword: boolean;
}) {
  // The plaintext, once something has put it here.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const [revealState, revealAction, revealPending] = useActionState(
    revealDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );
  const [generateState, generateAction, generatePending] = useActionState(
    generateDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearDevicePasswordAction,
    INITIAL_ACTION_STATE,
  );

  // The action results this cell has already acted on. Compared by identity, so
  // adoption happens on the render where a result *arrives* and never again —
  // which is what lets Hide stick: a later re-render cannot resurrect the value
  // the user just hid, while the next explicit reveal of that same password
  // comes back as a new result and is adopted like any other.
  const [seen, setSeen] = useState({
    reveal: revealState,
    generate: generateState,
  });

  // The copied tick expires on its own, so the icon does not sit there claiming
  // a copy that happened a minute ago.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Render-phase adoption of a freshly returned value. Generation and reveal both
  // land the new value here, so there is one place that holds a plaintext and one
  // thing to clear. Clear takes priority: once the clear action has succeeded the
  // plaintext is dropped and cannot be re-adopted from a generate or reveal result
  // that has not yet been flushed by the page refresh.
  //
  // Results are marked seen even when they are passed over — because the slot is
  // already full, say — so hiding a password later never resurrects a result that
  // arrived while it was showing.
  const revealChanged = seen.reveal !== revealState;
  const generateChanged = seen.generate !== generateState;
  if (revealChanged || generateChanged) {
    setSeen({ reveal: revealState, generate: generateState });
  }

  if (clearState.ok) {
    if (revealed !== null) setRevealed(null);
  } else if (revealed === null) {
    const genPw = generateState.data?.password;
    if (generateChanged && genPw) {
      setRevealed(genPw);
    } else if (revealChanged && revealState.data) {
      setRevealed(revealState.data);
    }
  }

  async function copy() {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed);
    setCopied(true);
  }

  const busy = revealPending || generatePending || clearPending;

  // Failure text goes in the cell's own `title`, not a banner: twenty rows on a
  // register all failing at once should not produce twenty identical alerts
  // stacked over the table. The tooltip carries the message and the button goes
  // back to its idle state, which is enough to act on.
  const error = revealState.error || generateState.error;

  return (
    <>
      <div className="flex items-center gap-c54-1" title={error || undefined}>
        {hasPassword || revealed ? (
          <code
            className="shrink-0 font-c54-mono text-c54-xs text-c54-text-primary whitespace-nowrap truncate"
            aria-live="polite"
            aria-label={revealed ? `Device password for ${assetId}` : undefined}
          >
            {revealed ?? "••••••••"}
          </code>
        ) : (
          <span className="text-c54-2xs text-c54-text-muted">Not set</span>
        )}

        {revealed ? (
          <>
            <IconButton
              label={`Copy device password for ${assetId}`}
              disabled={busy}
              onClick={copy}
            >
              {copied ? (
                <Check aria-hidden="true" className="size-3.5 text-c54-action-success" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )}
            </IconButton>
            <IconButton
              label={`Hide device password for ${assetId}`}
              onClick={() => setRevealed(null)}
            >
              <EyeOff aria-hidden="true" className="size-3.5" />
            </IconButton>
          </>
        ) : hasPassword ? (
          <form action={revealAction} className="contents">
            <input type="hidden" name="assetId" value={assetId} />
            <SubmitButton
              variant="ghost"
              size="icon-sm"
              pendingLabel=""
              pending={revealPending}
              disabled={busy}
              title={`Reveal device password for ${assetId}`}
              aria-label={`Reveal device password for ${assetId}`}
            >
              <Eye aria-hidden="true" className="size-3.5" />
            </SubmitButton>
          </form>
        ) : null}

        {!hasPassword && !revealed && (
          <form action={generateAction} className="contents">
            <input type="hidden" name="assetId" value={assetId} />
            <SubmitButton
              variant="ghost"
              size="icon-sm"
              pendingLabel=""
              pending={generatePending}
              disabled={busy}
              title={`Generate a password for ${assetId}`}
              aria-label={`Generate a password for ${assetId}`}
            >
              <Dices aria-hidden="true" className="size-3.5" />
            </SubmitButton>
          </form>
        )}

        {hasPassword || revealed ? (
          <IconButton
            label={`Forget device password for ${assetId}`}
            disabled={busy}
            onClick={() => setClearOpen(true)}
            className="hover:bg-c54-bg-danger hover:text-c54-action-danger"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </IconButton>
        ) : null}
      </div>

      <ConfirmDialog
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

/** Icon-sized ghost button. Matches the row action menu's hover treatment. */
function IconButton({
  label,
  children,
  onClick,
  disabled,
  className,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={className}
    >
      {children}
    </Button>
  );
}