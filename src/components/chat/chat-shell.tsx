"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sidebar,
  useSidebarCollapse,
} from "./sidebar";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { DevLogin } from "./dev-login";
import { ModelPicker, type ModelPickerStatus } from "./model-picker";
import { ConversationList, type ConversationListStatus } from "./conversation-list";
import { ConversationMenu } from "./conversation-menu";
import { DeleteDialog, RenameDialog } from "./conversation-dialogs";
import { conversationTitle, filterConversations } from "./conversation-utils";
import { runCompletionStream } from "./chat-client";
import { isModelSelectable, type PublicModel } from "./model-utils";
import { messageContentToText } from "./message-content";
import type { PublicConversation } from "@/lib/gateway-chat";
import type { ChatErrorInfo, ChatMessage, ChatStatus } from "./types";

function toModelList(body: unknown): PublicModel[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }
  const models = (body as Record<string, unknown>)["models"];
  if (!Array.isArray(models)) {
    return [];
  }
  const list: PublicModel[] = [];
  for (const entry of models) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>)["id"] === "string" &&
      typeof (entry as Record<string, unknown>)["displayName"] === "string"
    ) {
      list.push(entry as PublicModel);
    }
  }
  return list;
}

function toConversationEntry(entry: unknown): PublicConversation | null {
  if (
    entry !== null &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>)["id"] === "string" &&
    (entry as Record<string, unknown>)["id"] !== ""
  ) {
    return entry as PublicConversation;
  }
  return null;
}

function toConversationList(body: unknown): {
  conversations: PublicConversation[];
  hasMore: boolean;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { conversations: [], hasMore: false };
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record["conversations"])) {
    return { conversations: [], hasMore: false };
  }
  const conversations: PublicConversation[] = [];
  for (const entry of record["conversations"]) {
    const conversation = toConversationEntry(entry);
    if (conversation !== null) {
      conversations.push(conversation);
    }
  }
  return {
    conversations,
    hasMore: record["hasMore"] === true,
  };
}

function toChatMessages(body: unknown): ChatMessage[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record["messages"])) {
    return [];
  }
  const messages: ChatMessage[] = [];
  for (const entry of record["messages"]) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>)["id"] === "string"
    ) {
      const item = entry as Record<string, unknown>;
      // History content may be a string or structured parts; render text
      // only (thinking parts stay hidden) rather than dropping the message.
      const content = messageContentToText(item["content"]);
      if (content === "") {
        continue;
      }
      let timestamp: string | undefined = undefined;
      if (typeof item["createdAt"] === "string" && item["createdAt"] !== "") {
        try {
          const d = new Date(item["createdAt"] as string);
          if (!Number.isNaN(d.getTime())) {
            timestamp = d.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });
          }
        } catch {
          // Leave undefined
        }
      }
      messages.push({
        id: item["id"] as string,
        role: item["role"] === "user" ? "user" : "assistant",
        content,
        timestamp,
      });
    }
  }
  return messages;
}

function hasMoreMessages(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }
  return (body as Record<string, unknown>)["hasMore"] === true;
}

function bffErrorMessage(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>)["error"];
    if (error !== null && typeof error === "object" && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>)["message"];
      if (typeof message === "string" && message !== "") {
        return message;
      }
    }
  }
  return fallback;
}

/** Raise and delete go through the BFF only; failures surface as messages. */
async function requestConversationMutation(
  method: "PATCH" | "DELETE",
  id: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const fallback =
    method === "DELETE"
      ? "Could not delete the conversation."
      : "Could not update the conversation.";
  let response: Response;
  try {
    response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method,
      headers:
        body === undefined
          ? { Accept: "application/json" }
          : { "Content-Type": "application/json", Accept: "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("Could not reach BILLY.");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(bffErrorMessage(payload, fallback));
  }
  return payload;
}

/** The server's copy of a conversation is authoritative for the list. */
function replaceConversation(
  conversations: readonly PublicConversation[],
  updated: PublicConversation,
): PublicConversation[] {
  return conversations.map((conversation) =>
    conversation.id === updated.id ? { ...conversation, ...updated } : conversation,
  );
}

export function ChatShell() {
  // Active conversation state lives in React only: the server-generated
  // ID, the visible messages, and the selected model. Saved history loads
  // from the backend on selection and is never re-sent — the server
  // hydrates it and new turns submit only the new user message.
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<ChatErrorInfo | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const [models, setModels] = useState<readonly PublicModel[]>([]);
  const [modelsStatus, setModelsStatus] = useState<ModelPickerStatus>("loading");
  const [modelsError, setModelsError] = useState<string | undefined>(undefined);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<readonly PublicConversation[]>([]);
  const [convListStatus, setConvListStatus] =
    useState<ConversationListStatus>("loading");
  const [convListError, setConvListError] = useState<string | undefined>(undefined);
  const [convHasMore, setConvHasMore] = useState(false);
  const [messagesTruncated, setMessagesTruncated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<PublicConversation | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicConversation | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const selectRequestRef = useRef(0);
  const sidebar = useSidebarCollapse();

  // Header actions belong to a persisted conversation, so they appear only
  // once the list carries the active conversation.
  const activeConversation =
    conversations.find((conversation) => conversation.id === conversationId) ?? null;
  const activeConversationTitle = activeConversation?.title ?? "New chat";

  const visibleConversations = filterConversations(conversations, searchQuery);

  const loadModels = useCallback(async () => {
    setModelsStatus("loading");
    setModelsError(undefined);
    try {
      const response = await fetch("/api/models", {
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        setModels([]);
        setModelsStatus("login-required");
        setAuthed(false);
        return;
      }
      if (response.status === 404) {
        setModels([]);
        setModelsStatus("disabled");
        setAuthed(false);
        return;
      }
      if (!response.ok) {
        let message = "Could not load models.";
        try {
          message = bffErrorMessage(await response.json(), message);
        } catch {
          // Keep the default message.
        }
        setModels([]);
        setModelsStatus("error");
        setModelsError(message);
        setAuthed(true);
        return;
      }
      const list = toModelList(await response.json());
      setModels(list);
      setModelsStatus("ready");
      setAuthed(true);
      setSelectedModelId((previous) =>
        previous !== null && list.some((model) => model.id === previous)
          ? previous
          : (list.find(isModelSelectable)?.id ?? null),
      );
    } catch {
      setModels([]);
      setModelsStatus("error");
      setModelsError("Could not load models.");
    }
  }, []);

  const loadConversations = useCallback(async () => {
    setConvListStatus("loading");
    setConvListError(undefined);
    try {
      const response = await fetch("/api/conversations", {
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        setConversations([]);
        setConvHasMore(false);
        setConvListStatus("login-required");
        setAuthed(false);
        return;
      }
      if (response.status === 404) {
        setConversations([]);
        setConvHasMore(false);
        setConvListStatus("disabled");
        setAuthed(false);
        return;
      }
      if (!response.ok) {
        let message = "Could not load conversations.";
        try {
          message = bffErrorMessage(await response.json(), message);
        } catch {
          // Keep the default message.
        }
        setConversations([]);
        setConvHasMore(false);
        setConvListStatus("error");
        setConvListError(message);
        setAuthed(true);
        return;
      }
      const list = toConversationList(await response.json());
      setConversations(list.conversations);
      setConvHasMore(list.hasMore);
      setConvListStatus("ready");
      setAuthed(true);
    } catch {
      setConversations([]);
      setConvHasMore(false);
      setConvListStatus("error");
      setConvListError("Could not load conversations.");
    }
  }, []);

  useEffect(() => {
    // Initial loads on mount; refreshes only via explicit login or send.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadModels();
    void loadConversations();
  }, [loadModels, loadConversations]);

  async function requestConversation(signal: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
        signal,
      });
    } catch {
      throw new Error(signal.aborted ? "ABORTED" : "Could not reach BILLY.");
    }
    if (!response.ok) {
      if (response.status === 401) {
        setAuthed(false);
      }
      let message = "Could not start a conversation.";
      try {
        message = bffErrorMessage(await response.json(), message);
      } catch {
        // Keep the default message.
      }
      throw new Error(message);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("Could not start a conversation.");
    }
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      const conversation = (body as Record<string, unknown>)["conversation"];
      if (
        conversation !== null &&
        typeof conversation === "object" &&
        !Array.isArray(conversation) &&
        typeof (conversation as Record<string, unknown>)["id"] === "string" &&
        ((conversation as Record<string, unknown>)["id"] as string) !== ""
      ) {
        return (conversation as Record<string, unknown>)["id"] as string;
      }
    }
    throw new Error("Could not start a conversation.");
  }

  async function handleSelectConversation(id: string) {
    // Never yank state out from under an in-flight stream; the user can
    // switch after it finishes or starts a new chat to abort it.
    if (sending) {
      return;
    }
    selectRequestRef.current += 1;
    const request = selectRequestRef.current;
    setConversationId(id);
    setMessages([]);
    setMessagesTruncated(false);
    setStatus("loading");
    setError(null);
    setMobileOpen(false);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(id)}/messages`,
        { headers: { Accept: "application/json" } },
      );
      if (selectRequestRef.current !== request) {
        return;
      }
      if (response.status === 401) {
        setAuthed(false);
        setConversations([]);
        setConvHasMore(false);
        setConvListStatus("login-required");
        setStatus("idle");
        return;
      }
      if (!response.ok) {
        let message = "Could not load messages.";
        try {
          message = bffErrorMessage(await response.json(), message);
        } catch {
          // Keep the default message.
        }
        setStatus("error");
        setError({ code: "HISTORY_FAILED", message });
        return;
      }
      const body: unknown = await response.json();
      if (selectRequestRef.current !== request) {
        return;
      }
      setMessages(toChatMessages(body));
      setMessagesTruncated(hasMoreMessages(body));
      setStatus("idle");
    } catch {
      if (selectRequestRef.current !== request) {
        return;
      }
      setStatus("error");
      setError({ code: "CONNECTION_FAILED", message: "Could not reach BILLY." });
    }
  }

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (sending || !authed || selectedModelId === null || trimmed === "") {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setError(null);
    setStatus("loading");
    setClearSignal((value) => value + 1);
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ]);

    let convoId = conversationId;
    let createdNewConversation = false;
    try {
      if (convoId === null) {
        convoId = await requestConversation(controller.signal);
        setConversationId(convoId);
        createdNewConversation = true;
      }
      const assistantId = crypto.randomUUID();
      const sentModelName =
        models.find((model) => model.id === selectedModelId)?.displayName ??
        selectedModelId;
      const sentAt = new Date().toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      let firstToken = false;
      const outcome = await runCompletionStream({
        body: { conversationId: convoId, model: selectedModelId, message: trimmed },
        signal: controller.signal,
        onToken: (delta) => {
          if (!firstToken) {
            firstToken = true;
            setStatus("idle");
            setMessages((previous) => [
              ...previous,
              {
                id: assistantId,
                role: "assistant",
                content: delta,
                isStreaming: true,
                model: sentModelName,
                timestamp: sentAt,
              },
            ]);
          } else {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          }
        },
      });
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId ? { ...message, isStreaming: false } : message,
        ),
      );
      if (controller.signal.aborted) {
        // New Chat owns the reset state; do not resurrect UI.
      } else if (outcome.ok) {
        setStatus("idle");
        if (createdNewConversation) {
          void loadConversations();
        }
      } else {
        if (outcome.code === "AUTH_REQUIRED") {
          setAuthed(false);
        }
        setStatus("error");
        setError({ code: outcome.code, message: outcome.message });
      }
    } catch {
      if (!controller.signal.aborted) {
        setStatus("error");
        setError({ code: "CONNECTION_FAILED", message: "Could not reach BILLY." });
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setSending(false);
    }
  }

  function resetToEmptyChat() {
    // Abort any in-flight stream, then reset to a fresh chat. The next
    // message creates a brand-new server-side conversation. Outstanding
    // history fetches are invalidated so they cannot overwrite the reset.
    abortRef.current?.abort();
    abortRef.current = null;
    selectRequestRef.current += 1;
    setConversationId(null);
    setMessages([]);
    setMessagesTruncated(false);
    setStatus("idle");
    setError(null);
    setSending(false);
  }

  function handleNewChat() {
    resetToEmptyChat();
    setMobileOpen(false);
  }

  async function handleTogglePin(conversation: PublicConversation) {
    if (pendingConversationId !== null) {
      return;
    }
    const pinned = !conversation.pinned;
    setActionError(null);
    setPendingConversationId(conversation.id);
    // Optimistic so the row changes section immediately; the server copy
    // replaces it on success and the optimistic flag is reverted on failure.
    setConversations((previous) =>
      previous.map((item) => (item.id === conversation.id ? { ...item, pinned } : item)),
    );
    try {
      const payload = await requestConversationMutation("PATCH", conversation.id, {
        pinned,
      });
      const updated = toConversationEntry(
        (payload as Record<string, unknown> | null)?.["conversation"],
      );
      if (updated === null) {
        throw new Error("The pin state could not be confirmed.");
      }
      setConversations((previous) => replaceConversation(previous, updated));
    } catch (error) {
      setConversations((previous) =>
        previous.map((item) =>
          item.id === conversation.id ? { ...item, pinned: conversation.pinned } : item,
        ),
      );
      setActionError(
        error instanceof Error ? error.message : "Could not update the pinned state.",
      );
    } finally {
      setPendingConversationId(null);
    }
  }

  function openRename(conversation: PublicConversation) {
    setRenameTarget(conversation);
    setRenameDraft(conversation.title ?? "");
    setRenameError(null);
    setActionError(null);
  }

  async function handleRenameSave() {
    const target = renameTarget;
    if (target === null || renameSaving) {
      return;
    }
    const title = renameDraft.trim();
    if (title === "") {
      setRenameError("Enter a title.");
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const payload = await requestConversationMutation("PATCH", target.id, { title });
      const updated = toConversationEntry(
        (payload as Record<string, unknown> | null)?.["conversation"],
      );
      if (updated === null) {
        throw new Error("The new title could not be confirmed.");
      }
      setConversations((previous) => replaceConversation(previous, updated));
      setRenameTarget(null);
    } catch (error) {
      // The dialog stays open with the draft; the original title is intact.
      setRenameError(
        error instanceof Error ? error.message : "Could not rename the conversation.",
      );
    } finally {
      setRenameSaving(false);
    }
  }

  function openDelete(conversation: PublicConversation) {
    setDeleteTarget(conversation);
    setDeleteError(null);
    setActionError(null);
  }

  async function handleDeleteConfirm() {
    const target = deleteTarget;
    if (target === null || deletePending) {
      return;
    }
    setDeletePending(true);
    setDeleteError(null);
    try {
      await requestConversationMutation("DELETE", target.id);
      setConversations((previous) => previous.filter((item) => item.id !== target.id));
      setDeleteTarget(null);
      if (conversationId === target.id) {
        resetToEmptyChat();
      }
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Could not delete the conversation.",
      );
    } finally {
      setDeletePending(false);
    }
  }

  const canSend = authed && !sending && selectedModelId !== null;
  const sendReason = sending
    ? "BILLY is responding…"
    : !authed
      ? modelsStatus === "disabled"
        ? "Chat is unavailable in this environment."
        : "Sign in to enable sending."
      : selectedModelId === null
        ? "No selectable model available."
        : "";

  return (    <div className="flex h-dvh bg-paper text-ink">
      <Sidebar
        mobileOpen={mobileOpen}
        collapsed={sidebar.collapsed}
        onCollapse={sidebar.collapse}
        collapseButtonRef={sidebar.collapseButtonRef}
        expandButtonRef={sidebar.expandButtonRef}
        searchInputRef={sidebar.searchInputRef}
        historyNavRef={sidebar.historyNavRef}
        onExpand={sidebar.expand}
        onCloseMobile={() => {
          setMobileOpen(false);
          // Restore focus to the trigger that opened the drawer.
          menuButtonRef.current?.focus();
        }}
        onNewChat={handleNewChat}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        authed={authed}
        conversationsSection={
          <div>
            <ConversationList
              status={convListStatus}
              conversations={visibleConversations}
              activeId={conversationId}
              hasMore={convHasMore}
              errorMessage={convListError}
              pendingId={pendingConversationId}
              onSelect={(id) => void handleSelectConversation(id)}
              onRename={openRename}
              onDelete={openDelete}
              onTogglePin={(conversation) => void handleTogglePin(conversation)}
            />
            {actionError !== null ? (
              <p role="alert" className="px-3 pt-3 text-xs text-red-300">
                {actionError}
              </p>
            ) : null}
          </div>
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile: hamburger + centered BILLY wordmark + New Chat, with the
            model selector on a second compact row. */}
        <header className="bg-raised px-2 sm:px-6 md:border-b md:border-hairline">
          <div className="relative flex h-12 items-center justify-between md:hidden">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open sidebar"
              aria-expanded={mobileOpen}
              className="-ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="3" y1="5" x2="17" y2="5" />
                <line x1="3" y1="10" x2="17" y2="10" />
                <line x1="3" y1="15" x2="17" y2="15" />
              </svg>
            </button>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[15px] font-bold tracking-[0.18em] text-ink"
            >
              BILLY
            </span>
            <button
              type="button"
              onClick={handleNewChat}
              title="New chat"
              aria-label="New chat"
              className="-mr-1 flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
          {/* Centered model selector row (mobile only). */}
          <div className="flex items-center justify-center pb-2 md:hidden">
            <ModelPicker
              variant="compact"
              status={modelsStatus}
              models={models}
              selectedId={selectedModelId}
              errorMessage={modelsError}
              onSelect={setSelectedModelId}
            />
          </div>

          {/* Desktop top bar: conversation title on the lead side and, for
              a saved conversation, its Pin / Rename / Delete menu. New chat
              stays in the sidebar and the collapsed rail. */}
          <div className="hidden h-14 items-center justify-between gap-4 md:flex">
            <p
              className="min-w-0 truncate text-sm font-semibold text-ink"
              title={activeConversationTitle}
            >
              {activeConversationTitle}
            </p>
            {activeConversation !== null ? (
              <ConversationMenu
                label="Conversation actions"
                triggerClassName="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-muted"
                items={[
                  {
                    key: "pin",
                    label: activeConversation.pinned ? "Unpin chat" : "Pin chat",
                    onSelect: () => void handleTogglePin(activeConversation),
                  },
                  {
                    key: "rename",
                    label: "Rename chat",
                    onSelect: () => openRename(activeConversation),
                  },
                  {
                    key: "delete",
                    label: "Delete chat",
                    destructive: true,
                    onSelect: () => openDelete(activeConversation),
                  },
                ]}
              />
            ) : null}
          </div>
        </header>

        {modelsStatus === "login-required" ? (
          <DevLogin
            onSuccess={() => {
              void loadModels();
              void loadConversations();
            }}
          />
        ) : null}

        <main className="flex min-h-0 flex-1 flex-col">
          <MessageList
            messages={messages}
            status={status}
            error={error}
            notice={
              messagesTruncated
                ? "Earlier messages may exist beyond this view."
                : undefined
            }
          />
        </main>

        <Composer
          disabled={!canSend}
          disabledReason={sendReason}
          onSend={(text) => void handleSend(text)}
          clearSignal={clearSignal}
          modelControl={
            <ModelPicker
              variant="compact"
              status={modelsStatus}
              models={models}
              selectedId={selectedModelId}
              errorMessage={modelsError}
              onSelect={setSelectedModelId}
            />
          }
        />
      </div>

      <RenameDialog
        open={renameTarget !== null}
        value={renameDraft}
        saving={renameSaving}
        error={renameError}
        onChange={setRenameDraft}
        onSave={() => void handleRenameSave()}
        onCancel={() => setRenameTarget(null)}
      />
      <DeleteDialog
        open={deleteTarget !== null}
        conversationTitle={deleteTarget === null ? "" : conversationTitle(deleteTarget)}
        pending={deletePending}
        error={deleteError}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
