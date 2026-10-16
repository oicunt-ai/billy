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
        <p className="text-xs font-bold tracking-[0.25em] text-muted uppercase">
          BILLY
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          How can I help?
        </h1>
        <p className="mt-3 max-w-md text-sm sm:text-base leading-relaxed text-muted">
          Send a message below to start chatting.
        </p>
      </div>
    );
  }

  return (
    <div
      aria-label="Conversation"
      className="flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-[768px] flex-col gap-7 sm:gap-8 pb-4">
        {notice !== undefined && notice !== "" ? (
          <p className="rounded-xl border border-hairline bg-raised px-4 py-2 text-xs text-muted">
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
