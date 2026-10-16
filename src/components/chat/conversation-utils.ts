import type { PublicConversation } from "../../lib/gateway-chat.ts";

/** Mirrors the public conversation contract's title ceiling (platform contracts/ai.ts). */
export const MAX_CONVERSATION_TITLE_LENGTH = 200;

/** Display title for a conversation row or dialog, never empty. */
export function conversationTitle(conversation: PublicConversation): string {
  return conversation.title !== null && conversation.title !== ""
    ? conversation.title
    : "Untitled conversation";
}

/** Case-insensitive title filter; untitled conversations never match a query. */
export function filterConversations(
  conversations: readonly PublicConversation[],
  query: string,
): readonly PublicConversation[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return conversations;
  }
  return conversations.filter((conversation) =>
    (conversation.title ?? "").toLowerCase().includes(needle),
  );
}

/**
 * Split history into the pinned section and everything else. Server order
 * (most recently updated first) is preserved inside each group, so
 * pinning a conversation never reshuffles the rest of the list.
 */
export function groupConversations(conversations: readonly PublicConversation[]): {
  readonly pinned: readonly PublicConversation[];
  readonly others: readonly PublicConversation[];
} {
  const pinned: PublicConversation[] = [];
  const others: PublicConversation[] = [];
  for (const conversation of conversations) {
    (conversation.pinned ? pinned : others).push(conversation);
  }
  return { pinned, others };
}
