"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { MAX_CONVERSATION_TITLE_LENGTH } from "./conversation-utils";

/**
 * Native modal dialog: the focus trap, Escape handling, backdrop and
 * focus restoration come from the platform. Kept mounted and driven by
 * `open`, because removing a dialog from the DOM skips those close steps
 * (focus would be dropped on the body).
 */
function Modal({
  open,
  labelledBy,
  onCancel,
  children,
}: {
  readonly open: boolean;
  readonly labelledBy: string;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onCancel();
        }
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-raised p-5 text-ink shadow-xl backdrop:bg-black/50"
    >
      {children}
    </dialog>
  );
}

interface RenameDialogProps {
  readonly open: boolean;
  /** Draft is owned by the caller so a failed save keeps the user's text. */
  readonly value: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}

export function RenameDialog({
  open,
  value,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: RenameDialogProps) {
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const canSave = !saving && value.trim() !== "";

  useEffect(() => {
    if (open) {
      // Select all so the first keystroke replaces the old title.
      inputRef.current?.select();
    }
  }, [open]);

  return (
    <Modal open={open} labelledBy={headingId} onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) {
            onSave();
          }
        }}
      >
        <h2 id={headingId} className="text-base font-semibold text-ink">
          Rename chat
        </h2>
        <label htmlFor={`${headingId}-title`} className="sr-only">
          Chat title
        </label>
        <input
          id={`${headingId}-title`}
          ref={inputRef}
          type="text"
          value={value}
          maxLength={MAX_CONVERSATION_TITLE_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          className="mt-3 w-full rounded-xl border border-hairline bg-raised px-3 py-2 text-sm text-ink focus:border-silver focus:outline-none focus:ring-1 focus:ring-silver/60"
        />
        {error !== null ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface DeleteDialogProps {
  readonly open: boolean;
  readonly conversationTitle: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function DeleteDialog({
  open,
  conversationTitle,
  pending,
  error,
  onConfirm,
  onCancel,
}: DeleteDialogProps) {
  const headingId = useId();

  return (
    <Modal open={open} labelledBy={headingId} onCancel={onCancel}>
      <h2 id={headingId} className="text-base font-semibold text-ink">
        Delete chat
      </h2>
      <p className="mt-2 text-sm text-ink">
        Delete “{conversationTitle}”? It will no longer appear in your
        conversation history.
      </p>
      {error !== null ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
        >
          {pending ? "Deleting…" : "Delete chat"}
        </button>
      </div>
    </Modal>
  );
}
