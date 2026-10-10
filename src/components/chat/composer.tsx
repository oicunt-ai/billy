import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

interface ComposerProps {
  /**
   * Sending is unavailable while disabled (signed out, no model, or a
   * response in flight). The composer stays editable so keyboard behavior
   * can be verified without issuing requests.
   */
  readonly disabled: boolean;
  readonly disabledReason: string;
  readonly onSend?: ((text: string) => void) | undefined;
  /**
   * Incremented by the parent after a message is accepted; clears the
   * textarea without remounting it.
   */
  readonly clearSignal?: number | undefined;
}

export function Composer({ disabled, disabledReason, onSend, clearSignal }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (textareaRef.current) {
      textareaRef.current.value = "";
    }
  }, [clearSignal]);

  function canSend(value: string): boolean {
    return !disabled && onSend !== undefined && value.trim().length > 0;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      // Take over Enter so it never inserts a newline or submits a
      // request while sending is unavailable. Shift+Enter keeps its
      // native newline behavior.
      event.preventDefault();
      const textarea = textareaRef.current;
      if (textarea !== null && canSend(textarea.value)) {
        onSend?.(textarea.value);
      }
    }
  }

  return (
    <div className="border-t border-zinc-200 bg-white px-4 pt-3 pb-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <form
        aria-label="Message composer"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="billy-composer" className="sr-only">
          Message BILLY
        </label>
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            id="billy-composer"
            ref={textareaRef}
            rows={1}
            placeholder="Message BILLY…"
            aria-describedby="billy-composer-help"
            onKeyDown={handleKeyDown}
            className="max-h-40 flex-1 resize-none overflow-y-auto rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none sm:max-w-full dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
          />
          <button
            type="submit"
            disabled={disabled}
            title={disabled ? disabledReason : "Send message"}
            aria-label={disabled ? `Send (disabled: ${disabledReason})` : "Send message"}
            className="rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            Send
          </button>
        </div>
        <p
          id="billy-composer-help"
          className="mx-auto mt-2 max-w-3xl text-xs text-zinc-500 dark:text-zinc-400"
        >
          {disabled
            ? disabledReason
            : "Enter to send, Shift+Enter for a new line."}
        </p>
      </form>
    </div>
  );
}
