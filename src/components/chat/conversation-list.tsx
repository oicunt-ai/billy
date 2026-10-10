import type { PublicConversation } from "@/lib/gateway-chat";

export type ConversationListStatus =
  | "loading"
  | "ready"
  | "error"
  | "login-required"
  | "disabled";

interface ConversationListProps {
  readonly status: ConversationListStatus;
  readonly conversations: readonly PublicConversation[];
  readonly activeId: string | null;
  readonly hasMore: boolean;
  readonly errorMessage?: string | undefined;
  readonly onSelect: (id: string) => void;
}

function titleOf(conversation: PublicConversation): string {
  return conversation.title !== null && conversation.title !== ""
    ? conversation.title
    : "Untitled conversation";
}

export function ConversationList({
  status,
  conversations,
  activeId,
  hasMore,
  errorMessage,
  onSelect,
}: ConversationListProps) {
  if (status === "login-required") {
    return (
      <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Sign in to load conversations.
      </p>
    );
  }
  if (status === "disabled") {
    return (
      <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Conversation history is unavailable in this environment.
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="px-2 py-6 text-center text-sm text-red-700 dark:text-red-300">
        {errorMessage ?? "Could not load conversations."}
      </p>
    );
  }
  if (status === "loading") {
    return (
      <p aria-busy="true" className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading conversations…
      </p>
    );
  }
  if (conversations.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No conversations yet.
      </p>
    );
  }
  return (
    <div>
      <ul className="flex flex-col gap-1">
        {conversations.map((conversation) => {
          const active = conversation.id === activeId;
          return (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={active ? "true" : undefined}
                title={titleOf(conversation)}
                className={`w-full truncate rounded-lg px-2 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 ${
                  active
                    ? "bg-zinc-200 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                }`}
              >
                {titleOf(conversation)}
              </button>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <p className="px-2 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
          More conversations may exist.
        </p>
      ) : null}
    </div>
  );
}
