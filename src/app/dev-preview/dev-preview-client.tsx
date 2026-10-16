"use client";

import { useRef, useState } from "react";
import {
  Sidebar,
  useSidebarCollapse,
} from "@/components/chat/sidebar";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { ModelPicker } from "@/components/chat/model-picker";
import { ConversationList } from "@/components/chat/conversation-list";
import { ConversationMenu } from "@/components/chat/conversation-menu";
import { DeleteDialog, RenameDialog } from "@/components/chat/conversation-dialogs";
import { conversationTitle, filterConversations } from "@/components/chat/conversation-utils";
import type { ChatMessage } from "@/components/chat/types";
import type { PublicModel } from "@/components/chat/model-utils";
import type { PublicConversation } from "@/lib/gateway-chat";

const FIXTURE_MODELS: PublicModel[] = [
  {
    id: "gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    capabilities: ["chat"],
    status: "available",
  },
];

const FIXTURE_CONVERSATIONS: PublicConversation[] = [
  {
    id: "conv-1",
    title: "Next.js authentication",
    status: "active",
    messageCount: 2,
    createdAt: "2026-10-15T10:24:00.000Z",
    updatedAt: "2026-10-15T10:24:30.000Z",
    pinned: false,
  },
  {
    id: "conv-2",
    title: "Trip planning for Japan",
    status: "active",
    messageCount: 6,
    createdAt: "2026-10-14T14:10:00.000Z",
    updatedAt: "2026-10-14T14:15:00.000Z",
    pinned: true,
  },
  {
    id: "conv-3",
    title: "Python data analysis",
    status: "active",
    messageCount: 4,
    createdAt: "2026-10-14T11:00:00.000Z",
    updatedAt: "2026-10-14T11:20:00.000Z",
    pinned: false,
  },
  {
    id: "conv-4",
    title: "UI design ideas",
    status: "active",
    messageCount: 3,
    createdAt: "2026-10-13T09:30:00.000Z",
    updatedAt: "2026-10-13T09:45:00.000Z",
    pinned: false,
  },
  {
    id: "conv-5",
    title: "Kerala waste management",
    status: "active",
    messageCount: 8,
    createdAt: "2026-10-12T16:00:00.000Z",
    updatedAt: "2026-10-12T16:30:00.000Z",
    pinned: true,
  },
  {
    id: "conv-6",
    title: null,
    status: "active",
    messageCount: 5,
    createdAt: "2026-10-11T08:00:00.000Z",
    updatedAt: "2026-10-11T08:25:00.000Z",
    pinned: false,
  },
  {
    id: "conv-7",
    title: "Fiverr gig description",
    status: "active",
    messageCount: 2,
    createdAt: "2026-10-10T19:00:00.000Z",
    updatedAt: "2026-10-10T19:15:00.000Z",
    pinned: false,
  },
];

const FIXTURE_MESSAGES: ChatMessage[] = [
  {
    id: "msg-user-1",
    role: "user",
    content: "How do I implement authentication in Next.js?",
    timestamp: "10:24 AM",
  },
  {
    id: "msg-asst-1",
    role: "assistant",
    model: "GPT-OSS 20B",
    timestamp: "10:24 AM",
    content: `You can implement authentication in Next.js using a combination of secure session management, a trusted authentication library and proper authorization checks. Here's a practical approach using NextAuth.js, which is the most common and well-supported solution.

### 1. Install and configure NextAuth.js

First, install the necessary packages:

\`\`\`bash
npm install next-auth
\`\`\`

### 2. Set up the authentication route

Create an API route at \`app/api/auth/[...nextauth]/route.ts\`:`,
  },
];

export function DevPreviewClient() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("state") === "empty") return null;
    }
    return "conv-1";
  });
  const [conversations, setConversations] =
    useState<PublicConversation[]>(FIXTURE_CONVERSATIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<PublicConversation | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicConversation | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebar = useSidebarCollapse();

  // ?mode=fail drives the failure paths (no backend writes here at all).
  const failMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "fail";
  const failure = (action: string): Promise<never> =>
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`Could not ${action} the conversation.`)), 300);
    });

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeId) ?? null;
  const activeConversationTitle = activeConversation?.title ?? "New chat";
  const visibleConversations = filterConversations(conversations, searchQuery);

  function updateConversation(updated: PublicConversation) {
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === updated.id ? updated : conversation,
      ),
    );
  }

  async function handleTogglePin(conversation: PublicConversation) {
    setActionError(null);
    setPendingId(conversation.id);
    try {
      if (failMode) await failure("pin");
      updateConversation({ ...conversation, pinned: !conversation.pinned });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Pin failed.");
    } finally {
      setPendingId(null);
    }
  }

  function openRename(conversation: PublicConversation) {
    setRenameTarget(conversation);
    setRenameDraft(conversation.title ?? "");
    setRenameError(null);
  }

  async function handleRenameSave() {
    const target = renameTarget;
    if (target === null) return;
    const title = renameDraft.trim();
    if (title === "") {
      setRenameError("Enter a title.");
      return;
    }
    setRenameError(null);
    try {
      if (failMode) await failure("rename");
      updateConversation({ ...target, title });
      setRenameTarget(null);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Rename failed.");
    }
  }

  function openDelete(conversation: PublicConversation) {
    setDeleteTarget(conversation);
    setDeleteError(null);
  }

  async function handleDeleteConfirm() {
    const target = deleteTarget;
    if (target === null) return;
    setDeleteError(null);
    try {
      if (failMode) await failure("delete");
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== target.id),
      );
      setDeleteTarget(null);
      if (activeId === target.id) setActiveId(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Delete failed.");
    }
  }

  return (
    <div className="flex h-dvh bg-paper text-ink">
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
          menuButtonRef.current?.focus();
        }}
        onNewChat={() => {
          setActiveId(null);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        authed={true}
        conversationsSection={
          <div>
            <ConversationList
              status="ready"
              conversations={visibleConversations}
              activeId={activeId}
              hasMore={true}
              pendingId={pendingId}
              onSelect={(id) => setActiveId(id)}
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
            model selector on a second compact row. Mirrors ChatShell. */}
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
              onClick={() => setActiveId(null)}
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
              status="ready"
              models={FIXTURE_MODELS}
              selectedId="gpt-oss-20b"
              onSelect={() => {}}
            />
          </div>

          {/* Desktop top bar; mirrors ChatShell's header exactly apart from
              the fixture handlers. */}
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

        <main className="flex min-h-0 flex-1 flex-col">
          <MessageList
            messages={activeId !== null ? FIXTURE_MESSAGES : []}
            status="idle"
            error={null}
          />
        </main>

        <Composer
          disabled={false}
          disabledReason=""
          modelControl={
            <ModelPicker
              variant="compact"
              status="ready"
              models={FIXTURE_MODELS}
              selectedId="gpt-oss-20b"
              onSelect={() => {}}
            />
          }
          onSend={() => {}}
        />
      </div>

      <RenameDialog
        open={renameTarget !== null}
        value={renameDraft}
        saving={false}
        error={renameError}
        onChange={setRenameDraft}
        onSave={() => void handleRenameSave()}
        onCancel={() => setRenameTarget(null)}
      />
      <DeleteDialog
        open={deleteTarget !== null}
        conversationTitle={deleteTarget === null ? "" : conversationTitle(deleteTarget)}
        pending={false}
        error={deleteError}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
