import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

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
  /**
   * Model selector slot. Desktop renders it here as the primary control;
   * mobile hides it because the header keeps the centered selector.
   */
  readonly modelControl?: ReactNode | undefined;
}

function FilesIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function WebSearchIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ImagesIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

/**
 * Add-menu entries. None has a verified backend integration yet, so every
 * entry stays disabled and says so instead of faking an action.
 */
const ADD_ITEMS = [
  { label: "Files and documents", Icon: FilesIcon },
  { label: "Web search", Icon: WebSearchIcon },
  { label: "Images", Icon: ImagesIcon },
];

export function Composer({
  disabled,
  disabledReason,
  onSend,
  clearSignal,
  modelControl,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);
  const [addOpen, setAddOpen] = useState(false);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);

  function autoGrow() {
    // Grow with content up to the visible maximum, then scroll
    // internally. Reset to a single line before measuring so deletes
    // shrink the box again.
    const textarea = textareaRef.current;
    if (textarea === null) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (textareaRef.current) {
      textareaRef.current.value = "";
      autoGrow();
    }
  }, [clearSignal]);

  // The Add menu dismisses on outside pointer activity, on focus leaving it
  // (Tab away), and on Escape — which also returns focus to its trigger.
  useEffect(() => {
    if (!addOpen) {
      return;
    }
    function closeIfOutside(target: EventTarget | null) {
      if (!(target instanceof Node)) {
        return;
      }
      const inTrigger = addWrapRef.current?.contains(target) === true;
      const inMenu = addMenuRef.current?.contains(target) === true;
      if (!inTrigger && !inMenu) {
        setAddOpen(false);
      }
    }
    function handlePointerDown(event: PointerEvent) {
      closeIfOutside(event.target);
    }
    function handleFocusIn(event: FocusEvent) {
      closeIfOutside(event.target);
    }
    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setAddOpen(false);
      addTriggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [addOpen]);

  // Move focus to the first entry when the menu opens, so Tab walks the
  // menu instead of the composer controls behind it. Escape sends it back.
  useEffect(() => {
    if (!addOpen) {
      return;
    }
    addMenuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
  }, [addOpen]);

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
    <div
      className="bg-paper px-4 pt-4 pb-5 sm:px-6"
      style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      <form
        aria-label="Message composer"
        onSubmit={(event) => event.preventDefault()}
      >
        <label htmlFor="billy-composer" className="sr-only">
          Message BILLY
        </label>
        <div className="relative mx-auto max-w-3xl rounded-2xl sm:rounded-3xl border border-hairline bg-raised p-2 sm:p-3 shadow-[0_8px_30px_rgba(0,0,0,0.06)] focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-400 transition-all">
          <textarea
            id="billy-composer"
            ref={textareaRef}
            rows={1}
            placeholder="Ask anything…"
            aria-describedby="billy-composer-help"
            onKeyDown={handleKeyDown}
            onInput={autoGrow}
            className="max-h-40 w-full resize-none overflow-y-auto bg-transparent px-3 py-1.5 text-sm sm:text-base text-ink placeholder:text-muted focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 px-1 pt-2">
            <div className="flex items-center">
              <div ref={addWrapRef}>
                <button
                  ref={addTriggerRef}
                  type="button"
                  onClick={() => setAddOpen((open) => !open)}
                  title="Add to message"
                  aria-label="Add to message"
                  aria-haspopup="menu"
                  aria-expanded={addOpen}
                  aria-controls={addOpen ? "billy-add-menu" : undefined}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline bg-raised text-ink transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              {modelControl != null ? (
                <div className="hidden items-center md:flex">{modelControl}</div>
              ) : null}
              <button
                type="button"
                aria-disabled="true"
                title="Voice input is coming in a future update"
                aria-label="Microphone (coming soon)"
                aria-describedby="billy-voice-help"
                className="flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-full border border-hairline bg-raised text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
              >
                <MicIcon />
              </button>
              <button
                type="submit"
                disabled={disabled}
                title={disabled ? disabledReason : "Send message"}
                aria-label={disabled ? `Send (disabled: ${disabledReason})` : "Send message"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-950 text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-wash disabled:text-muted/60"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="10" y1="16" x2="10" y2="4" />
                  <polyline points="5 9 10 4 15 9" />
                </svg>
                <span className="sr-only">Send</span>
              </button>
            </div>
          </div>

          {/* Anchored to the composer box so it opens clear of it, matching
              the reference: menu above, composer untouched below. */}
          {addOpen ? (
            <div
              id="billy-add-menu"
              ref={addMenuRef}
              role="menu"
              aria-label="Add to message"
              className="absolute bottom-full left-3 z-30 mb-2 w-64 rounded-2xl border border-hairline bg-raised p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] sm:left-4 sm:w-72"
            >
              {ADD_ITEMS.map(({ label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  aria-disabled="true"
                  className="flex w-full cursor-not-allowed items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-paper text-muted"
                  >
                    <Icon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {label}
                    </span>
                    <span className="block text-[11px] text-muted">
                      Coming in V1
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p id="billy-composer-help" className="sr-only">
          {disabled
            ? disabledReason
            : "Enter to send, Shift+Enter for a new line."}
        </p>
        <p id="billy-voice-help" className="sr-only">
          Voice input is not available yet. Coming in a future update.
        </p>
      </form>
    </div>
  );
}
