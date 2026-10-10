import type { ChatErrorInfo } from "./types";

interface ChatErrorProps {
  readonly error: ChatErrorInfo;
  /**
   * Provided by the future integration layer. When omitted, no retry
   * control is rendered — an error with no recovery path must not offer
   * a dead button.
   */
  readonly onRetry?: (() => void) | undefined;
}

export function ChatError({ error, onRetry }: ChatErrorProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    >
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1">
        {error.message}{" "}
        <span className="font-mono text-xs opacity-75">({error.code})</span>
      </p>
      {onRetry !== undefined ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-full border border-red-300 px-3 py-1 text-xs font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
