import { useId } from "react";
import type { PublicConversation } from "@/lib/gateway-chat";
import { ConversationMenu } from "./conversation-menu";
import { conversationTitle, groupConversations } from "./conversation-utils";

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
  readonly onRename: (conversation: PublicConversation) => void;
  readonly onDelete: (conversation: PublicConversation) => void;
  readonly onTogglePin: (conversation: PublicConversation) => void;
  /** Conversation with a mutation in flight; its controls stay disabled. */
  readonly pendingId?: string | null | undefined;
}

const ROW_ACTION_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver disabled:cursor-not-allowed disabled:opacity-40";

function PinIcon({ filled }: { readonly filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M15 7V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2a1 1 0 0 1-1 1 2 2 0 0 0-2 2v1a1 1 0 0 0 .4.8L5 15v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1l1.6-1.2A1 1 0 0 0 21 13v-1a2 2 0 0 0-2-2 1 1 0 0 1-1-1z" />
    </svg>
  );
}

/**
 * One history row: open the conversation, or use its actions. Actions are
 * sibling buttons (never nested in the title button) so acting on a row
 * can never open it, and they stay visible at all times for touch, where
 * there is no hover to reveal them.
 */
function ConversationRow({
  conversation,
  active,
  busy,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
}: {
  readonly conversation: PublicConversation;
  readonly active: boolean;
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
  readonly onRename: (conversation: PublicConversation) => void;
  readonly onDelete: (conversation: PublicConversation) => void;
  readonly onTogglePin: (conversation: PublicConversation) => void;
}) {
  const title = conversationTitle(conversation);
  return (
    <li
      className={`flex items-center rounded-lg pr-1 transition-colors ${
        active ? "bg-white/10" : "hover:bg-white/5"
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={active ? "true" : undefined}
        title={title}
        className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver ${
          active
            ? "font-medium text-zinc-100"
            : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {title}
      </button>
      <ConversationMenu
        label={`Actions for ${title}`}
        disabled={busy}
        triggerClassName={ROW_ACTION_CLASS}
        items={[
          { key: "rename", label: "Rename", onSelect: () => onRename(conversation) },
          {
            key: "delete",
            label: "Delete",
            destructive: true,
            onSelect: () => onDelete(conversation),
          },
        ]}
      />
      <button
        type="button"
        onClick={() => onTogglePin(conversation)}
        disabled={busy}
        aria-pressed={conversation.pinned}
        title={conversation.pinned ? `Unpin ${title}` : `Pin ${title}`}
        aria-label={conversation.pinned ? `Unpin ${title}` : `Pin ${title}`}
        className={`${ROW_ACTION_CLASS} ${conversation.pinned ? "text-zinc-100" : ""}`}
      >
        <PinIcon filled={conversation.pinned} />
      </button>
    </li>
  );
}

export function ConversationList({
  status,
  conversations,
  activeId,
  hasMore,
  errorMessage,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  pendingId,
}: ConversationListProps) {
  const pinnedHeadingId = useId();
  const conversationHeadingId = useId();

  if (status === "login-required") {
    return (
      <p className="px-2 py-6 text-center text-sm text-zinc-400">
        Sign in to load conversations.
      </p>
    );
  }
  if (status === "disabled") {
    return (
      <p className="px-2 py-6 text-center text-sm text-zinc-400">
        Conversation history is unavailable in this environment.
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="px-2 py-6 text-center text-sm text-red-300">
        {errorMessage ?? "Could not load conversations."}
      </p>
    );
  }
  if (status === "loading") {
    return (
      <p aria-busy="true" className="px-2 py-6 text-center text-sm text-zinc-400">
        Loading conversations…
      </p>
    );
  }

  const { pinned, others } = groupConversations(conversations);

  function renderRow(conversation: PublicConversation) {
    return (
      <ConversationRow
        key={conversation.id}
        conversation={conversation}
        active={conversation.id === activeId}
        busy={conversation.id === pendingId}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {pinned.length > 0 ? (
        <section aria-labelledby={pinnedHeadingId}>
          <h3
            id={pinnedHeadingId}
            className="px-3 pb-1 text-xs font-medium text-zinc-400"
          >
            Pinned
          </h3>
          <ul className="flex flex-col gap-0.5">{pinned.map(renderRow)}</ul>
        </section>
      ) : null}
      <section
        aria-labelledby={conversationHeadingId}
        className={pinned.length > 0 ? "pt-4" : undefined}
      >
        <h3
          id={conversationHeadingId}
          className="px-3 pb-1 text-xs font-medium text-zinc-400"
        >
          Conversations
        </h3>
        {others.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-zinc-400">
            No conversations yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">{others.map(renderRow)}</ul>
        )}
      </section>
      {hasMore ? (
        <p className="px-3 pt-2 text-xs text-zinc-400">
          More conversations available.
        </p>
      ) : null}
    </div>
  );
}
