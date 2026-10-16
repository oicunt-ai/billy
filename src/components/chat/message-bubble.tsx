import Image from "next/image";
import type { ChatMessage } from "./types";
import { MessageCopyButton, MessageMarkdown } from "./message-markdown";

interface MessageBubbleProps {
  readonly message: ChatMessage;
}

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

function AssistantHeader({ message }: MessageBubbleProps) {
  const hasModel = message.model !== undefined && message.model !== "";
  const hasTime = message.timestamp !== undefined && message.timestamp !== "";
  // Copy is a real, always-available action, so the row exists for it too —
  // that keeps attribution and copy on one stable line instead of the copy
  // only appearing on turns that happen to carry a model name.
  const showCopy = message.isStreaming !== true && message.content !== "";

  if (!hasModel && !hasTime && !showCopy) {
    return null;
  }

  return (
    <div className="mb-2 flex min-h-8 items-center gap-2">
      {hasModel ? (
        <span className="shrink-0 text-[13px] font-semibold text-ink">
          {message.model}
        </span>
      ) : null}
      {hasTime ? (
        <span className="shrink-0 text-xs text-muted">{message.timestamp}</span>
      ) : null}
      {showCopy ? (
        <>
          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-hairline" />
          <span className="shrink-0 inline-flex">
            <MessageCopyButton text={message.content} />
          </span>
        </>
      ) : null}
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <div
          data-testid={`message-${message.id}`}
          className="max-w-[85%] rounded-2xl rounded-br-sm bg-wash px-4 py-2.5 text-sm leading-relaxed text-ink sm:max-w-[65%] sm:text-[15px]"
        >
          <span className="sr-only">You said: </span>
          <StreamingContent message={message} />
        </div>
        {message.timestamp !== undefined && message.timestamp !== "" ? (
          <span className="mt-1.5 pr-1 text-[11px] text-muted">
            {message.timestamp}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group flex justify-start gap-3">
      {/* 32px avatar, top-aligned to the 32px metadata row below it. */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
        <Image
          src="/oi-logo.png"
          alt="BILLY"
          width={32}
          height={32}
          className="rounded-full"
        />
      </div>
      <div
        data-testid={`message-${message.id}`}
        aria-live={message.isStreaming === true ? "polite" : undefined}
        className="min-w-0 flex-1 max-w-[92%] sm:max-w-[85%]"
      >
        <span className="sr-only">BILLY said: </span>
        <AssistantHeader message={message} />
        {message.isStreaming === true ? (
          <StreamingContent message={message} />
        ) : (
          <MessageMarkdown text={message.content} />
        )}
      </div>
    </div>
  );
}
