import { useEffect, type ReactNode } from "react";

interface SidebarProps {
  readonly mobileOpen: boolean;
  readonly onCloseMobile: () => void;
  readonly onNewChat: () => void;
  readonly modelSection?: ReactNode | undefined;
  readonly conversationsSection?: ReactNode | undefined;
}

function SidebarBody({
  onNewChat,
  modelSection,
  conversationsSection,
}: {
  readonly onNewChat: () => void;
  readonly modelSection?: ReactNode | undefined;
  readonly conversationsSection?: ReactNode | undefined;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-4">
        <p className="px-2 text-sm font-semibold tracking-widest text-zinc-500 uppercase dark:text-zinc-400">
          BILLY
        </p>
        <button
          type="button"
          onClick={onNewChat}
          className="mt-3 w-full rounded-full border border-zinc-300 px-4 py-2 text-left text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          + New chat
        </button>
      </div>
      <div className="mt-4 border-t border-zinc-200 px-3 pt-4 dark:border-zinc-800">
        {modelSection}
      </div>
      <nav aria-label="Conversations" className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
        {conversationsSection ?? (
          <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No conversations yet.
          </p>
        )}
      </nav>
      <p className="border-t border-zinc-200 px-5 py-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Chat history loads from the server after sign-in.
      </p>
    </div>
  );
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  onNewChat,
  modelSection,
  conversationsSection,
}: SidebarProps) {
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onCloseMobile();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        aria-label="BILLY sidebar"
        className="hidden w-72 shrink-0 border-r border-zinc-200 bg-zinc-50 md:block dark:border-zinc-800 dark:bg-zinc-900"
      >
        <SidebarBody
          onNewChat={onNewChat}
          modelSection={modelSection}
          conversationsSection={conversationsSection}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={onCloseMobile}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <aside
            aria-label="BILLY sidebar"
            className="absolute inset-y-0 left-0 w-72 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <SidebarBody
              onNewChat={onNewChat}
              modelSection={modelSection}
              conversationsSection={conversationsSection}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
