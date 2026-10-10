"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./sidebar";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { DevLogin } from "./dev-login";
import { ModelPicker, type ModelPickerStatus } from "./model-picker";
import { ConversationList, type ConversationListStatus } from "./conversation-list";
import { runCompletionStream } from "./chat-client";
import { isModelSelectable, type PublicModel } from "./model-utils";
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
    if (
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>)["id"] === "string" &&
      (entry as Record<string, unknown>)["id"] !== ""
    ) {
      conversations.push(entry as PublicConversation);
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
      typeof (entry as Record<string, unknown>)["id"] === "string" &&
      typeof (entry as Record<string, unknown>)["content"] === "string"
    ) {
      const item = entry as Record<string, unknown>;
      messages.push({
        id: item["id"] as string,
        role: item["role"] === "user" ? "user" : "assistant",
        content: item["content"] as string,
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
  const selectRequestRef = useRef(0);

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
              { id: assistantId, role: "assistant", content: delta, isStreaming: true },
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

  function handleNewChat() {
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
    setMobileOpen(false);
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

  return (
    <div className="flex h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onNewChat={handleNewChat}
        modelSection={
          <ModelPicker
            status={modelsStatus}
            models={models}
            selectedId={selectedModelId}
            errorMessage={modelsError}
            onSelect={setSelectedModelId}
          />
        }
        conversationsSection={
          <ConversationList
            status={convListStatus}
            conversations={conversations}
            activeId={conversationId}
            hasMore={convHasMore}
            errorMessage={convListError}
            onSelect={(id) => void handleSelectConversation(id)}
          />
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={mobileOpen}
            className="rounded-md p-2 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 md:hidden dark:text-zinc-200 dark:hover:bg-zinc-900"
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
          <p className="text-sm font-semibold tracking-widest uppercase">
            BILLY
          </p>
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 md:hidden dark:border-zinc-700 dark:text-zinc-400">
            {messages.length === 0 ? "New chat" : "Chat"}
          </span>
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
        />
      </div>
    </div>
  );
}
