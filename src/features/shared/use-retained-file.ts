"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RetainedFileOptions {
  /**
   * The action state. Its identity changes on every return from the action, which
   * is the signal that something was submitted.
   */
  submission: unknown;
  /** Whether the submission just succeeded. */
  ok: boolean;
  /**
   * Drop the file once it has been stored.
   *
   * A form that navigates away on success needs nothing — it is unmounted, and
   * the picker that matters next is a different one. A panel that stays mounted
   * alongside the saved photo does: without this the label goes on advertising a
   * second copy of a picture that is already there.
   */
  clearOnSuccess?: boolean;
}

/**
 * Keeps a picked file across a rejected submission.
 *
 * A `File` cannot ride back through a Server Action's state: the state has to
 * serialise, and a browser will not re-open a file picker to get one. So the file
 * is held here on the client and re-attached to the input's own `FileList`
 * through a `DataTransfer` whenever a submission comes back rejected. Without
 * this the retry silently uploads no photo while the label beside it still
 * claims one is chosen — the one combination that is worse than losing it,
 * because it looks like it worked.
 *
 * The other half of the job is the failure mode: React empties an uncontrolled
 * form once its action returns, whether or not it succeeded, so without putting
 * the file back a rejected upload would leave the picker blank and the name gone.
 *
 * Spread `inputProps` onto the `<input type="file">`. It is a callback ref rather
 * than a ref object so the node never has to be named where it is rendered.
 */
export function useRetainedFile({ submission, ok, clearOnSuccess = false }: RetainedFileOptions) {
  const nodeRef = useRef<HTMLInputElement | null>(null);
  // A ref, not state: the file has to survive the render that clears the input,
  // and a re-render must not be able to drop it on the way there.
  const retained = useRef<File | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  // The submission the file was released for. Null until a save succeeds, and
  // then only that one submission: without naming it, every later render would
  // keep clearing the picker.
  const [releasedFor, setReleasedFor] = useState<unknown>(null);
  const lastSubmission = useRef(submission);

  const setNode = useCallback((node: HTMLInputElement | null) => {
    nodeRef.current = node;
  }, []);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    retained.current = file;
    setPickedName(file ? file.name : null);
  }, []);

  // Adjusting state during render rather than in an effect: the release depends
  // on the submission that just arrived, not on anything outside this component,
  // which is the case React covers with a guarded set-state-during-render.
  if (ok && clearOnSuccess && releasedFor !== submission) {
    setReleasedFor(submission);
  }

  useEffect(() => {
    if (submission === lastSubmission.current) return;
    lastSubmission.current = submission;
    const released = releasedFor === submission;

    const input = nodeRef.current;
    if (!input) return;

    if (released) {
      // Stored: empty the picker so the next choice is not offered the file that
      // is already on the record.
      retained.current = null;
      input.value = "";
      return;
    }

    const file = retained.current;
    if (!file) return;

    // Assigning `files` does not fire a change event, so `retained` is untouched
    // and the label keeps showing the name the picker was given.
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  }, [submission, releasedFor]);

  return {
    name: releasedFor === submission ? null : pickedName,
    inputProps: { ref: setNode, onChange: handleChange },
  };
}