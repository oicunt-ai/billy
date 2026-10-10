import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  readonly message: ChatMessage;
}

/**
 * Boundary for future streamed updates: the same component renders the
 * final message and, with `isStreaming`, the in-progress one. Streaming
 * transport (SSE) is intentionally not implemented in this task.
 */
export function StreamingContent({ message }: MessageBubbleProps) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {message.content}
      {message.isStreaming === true ? (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-current"
        />
      ) : null}
    </span>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          data-testid={`message-${message.id}`}
          className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-2.5 text-zinc-50 sm:max-w-[75%] dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="sr-only">You said: </span>
          <StreamingContent message={message} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div
        data-testid={`message-${message.id}`}
        aria-live={message.isStreaming === true ? "polite" : undefined}
        className="max-w-[85%] rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-2.5 text-zinc-900 sm:max-w-[75%] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
      >
        <span className="sr-only">BILLY said: </span>
        <StreamingContent message={message} />
      </div>
    </div>
  );
}
