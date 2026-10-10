import type { ChatErrorInfo, ChatMessage, ChatStatus } from "./types";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";
import { ChatError } from "./chat-error";

interface MessageListProps {
  readonly messages: readonly ChatMessage[];
  readonly status: ChatStatus;
  readonly error: ChatErrorInfo | null;
  readonly notice?: string | undefined;
}

export function MessageList({ messages, status, error, notice }: MessageListProps) {
  if (messages.length === 0 && status === "idle" && error === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
          BILLY
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          How can I help?
        </h1>
        <p className="mt-3 max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Send a message below to start chatting. Replies stream back through
          BILLY&apos;s local development backend.
        </p>
      </div>
    );
  }

  return (
    <div
      aria-label="Conversation"
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {notice !== undefined && notice !== "" ? (
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {notice}
          </p>
        ) : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {status === "loading" ? <TypingIndicator /> : null}
        {error !== null ? <ChatError error={error} /> : null}
      </div>
    </div>
  );
}
