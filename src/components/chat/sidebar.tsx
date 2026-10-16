import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";

interface SidebarProps {
  readonly mobileOpen: boolean;
  readonly onCloseMobile: () => void;
  readonly onNewChat: () => void;
  readonly conversationsSection?: ReactNode | undefined;
  readonly searchQuery: string;
  readonly onSearchChange: (value: string) => void;
  readonly authed?: boolean | undefined;
  /** Desktop collapse. Owned by the shell (not this component) so the rail
   * state survives panel swaps and stays in sync with the header. */
  readonly collapsed: boolean;
  readonly onCollapse: () => void;
  readonly collapseButtonRef: Ref<HTMLButtonElement>;
  /** Focus targets the collapsed rail hands over to when it expands. */
  readonly expandButtonRef: Ref<HTMLButtonElement>;
  readonly searchInputRef: Ref<HTMLInputElement>;
  readonly historyNavRef: Ref<HTMLElement>;
  readonly onExpand: (target: RailExpandTarget) => void;
}

/** Shared panel glyph for the collapse / expand sidebar controls. */
function PanelIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

/** Where focus lands after the rail restores the full sidebar. */
export type RailExpandTarget = "sidebar" | "search" | "history";

/**
 * Desktop collapse state plus the focus hand-off between the controls that
 * replace each other (collapse sits in the sidebar panel, expand is the rail
 * logo). Shared so ChatShell and the dev preview keep identical behaviour.
 */
export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const historyNavRef = useRef<HTMLElement>(null);

  function collapse() {
    setCollapsed(true);
    // The collapse control is display:none while collapsed, so hand focus
    // to the rail logo that takes its place.
    requestAnimationFrame(() => expandButtonRef.current?.focus());
  }

  function expand(target: RailExpandTarget = "sidebar") {
    setCollapsed(false);
    // The panel mounts on this state change, so focus once it is painted:
    // the collapse control by default, or the control the rail button stands
    // for (search box, conversation history).
    requestAnimationFrame(() => {
      const next =
        target === "search"
          ? searchInputRef.current
          : target === "history"
            ? historyNavRef.current
            : collapseButtonRef.current;
      next?.focus();
    });
  }

  return {
    collapsed,
    collapse,
    expand,
    collapseButtonRef,
    expandButtonRef,
    searchInputRef,
    historyNavRef,
  } as const;
}

/** Icon button with a label that appears on hover and keyboard focus. */
function RailButton({
  label,
  onClick,
  buttonRef,
  ariaExpanded,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly buttonRef?: Ref<HTMLButtonElement> | undefined;
  /** Set only on the expand control, which owns the sidebar panel. */
  readonly ariaExpanded?: boolean | undefined;
  readonly children: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={ariaExpanded}
      aria-controls={ariaExpanded === undefined ? undefined : "billy-sidebar"}
      className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-full z-10 ml-2 hidden rounded-md bg-ink-900 px-2 py-1 text-xs whitespace-nowrap text-zinc-100 shadow group-hover:block group-focus-visible:block"
      >
        {label}
      </span>
    </button>
  );
}

/** Compact desktop navigation rail shown in place of the full sidebar. */
function SidebarRail({
  authed,
  onNewChat,
  onExpand,
  expandButtonRef,
}: {
  readonly authed?: boolean | undefined;
  readonly onNewChat: () => void;
  readonly onExpand: (target: RailExpandTarget) => void;
  readonly expandButtonRef: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-between bg-ink-950 py-3">
      <div className="flex flex-col items-center gap-1">
        <RailButton
          label="Expand sidebar"
          ariaExpanded={false}
          buttonRef={expandButtonRef}
          onClick={() => onExpand("sidebar")}
        >
          {/* Resting state is the brand mark; hover/focus reveals the action. */}
          <Image
            src="/oi-logo.png"
            alt=""
            width={22}
            height={22}
            className="rounded-full group-hover:hidden group-focus-visible:hidden"
          />
          <span className="hidden group-hover:block group-focus-visible:block">
            <PanelIcon />
          </span>
        </RailButton>
        <RailButton label="New chat" onClick={onNewChat}>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </RailButton>
        <RailButton label="Search conversations" onClick={() => onExpand("search")}>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </RailButton>
        <RailButton label="Conversations" onClick={() => onExpand("history")}>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </RailButton>
      </div>
      {/* Session indicator only: the same real session data as the expanded
          footer, no settings menu. */}
      <div
        role="img"
        aria-label={authed ? "Local Developer" : "Development Session"}
        title={authed ? "Local Developer" : "Development Session"}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-800 text-xs font-semibold text-zinc-200"
      >
        {authed ? "D" : "–"}
      </div>
    </div>
  );
}

function CollapseButton({
  onCollapse,
  collapseRef,
}: {
  readonly onCollapse: () => void;
  readonly collapseRef: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={collapseRef}
      type="button"
      onClick={onCollapse}
      title="Collapse sidebar"
      aria-label="Collapse sidebar"
      aria-expanded={true}
      aria-controls="billy-sidebar"
      className="-my-3 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
    >
      <PanelIcon />
    </button>
  );
}

function BrandMark({ trailing }: { readonly trailing?: ReactNode | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2.5">
        <Image
          src="/oi-logo.png"
          alt="OICUNT"
          width={28}
          height={28}
          className="rounded-full shrink-0"
          priority
        />
        <span className="truncate text-[15px] font-bold tracking-[0.18em] text-zinc-50">
          BILLY
        </span>
      </span>
      {trailing}
    </div>
  );
}

function SidebarFooter({ authed }: { readonly authed?: boolean | undefined }) {
  return (
    <div className="border-t border-zinc-800/80 p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700/60 text-xs font-semibold text-zinc-200">
          {authed ? "D" : "–"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-200">
            {authed ? "Local Developer" : "Development Session"}
          </p>
          <p className="truncate text-[11px] text-zinc-400">
            {authed ? "Authenticated session" : "Sign in to chat"}
          </p>
        </div>
      </div>
    </div>
  );
}

function SidebarBody({
  onNewChat,
  conversationsSection,
  searchQuery,
  onSearchChange,
  authed,
  onCollapse,
  collapseRef,
  searchInputRef,
  historyNavRef,
  brandTrailing,
}: {
  readonly onNewChat: () => void;
  readonly conversationsSection?: ReactNode | undefined;
  readonly searchQuery: string;
  readonly onSearchChange: (value: string) => void;
  readonly authed?: boolean | undefined;
  /** Desktop only; the mobile drawer keeps its own dismissal. */
  readonly onCollapse?: (() => void) | undefined;
  readonly collapseRef?: Ref<HTMLButtonElement> | undefined;
  /** Desktop only; let the rail move focus into the search box / history. */
  readonly searchInputRef?: Ref<HTMLInputElement> | undefined;
  readonly historyNavRef?: Ref<HTMLElement> | undefined;
  /** Overrides the trailing brand-row control (the drawer's close button). */
  readonly brandTrailing?: ReactNode | undefined;
}) {
  return (
    <div className="flex h-full flex-col bg-ink-950 text-zinc-200">
      <div className="px-4 pt-4">
        <BrandMark
          trailing={
            brandTrailing ??
            (onCollapse !== undefined && collapseRef !== undefined ? (
              <CollapseButton onCollapse={onCollapse} collapseRef={collapseRef} />
            ) : undefined)
          }
        />
      </div>
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/60 px-3.5 py-2.5 text-left text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-700 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
        >
          <svg
            className="h-4 w-4 shrink-0 text-zinc-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>New chat</span>
        </button>
        <div className="relative mt-2">
          <label htmlFor="billy-conversation-search" className="sr-only">
            Search conversations
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            id="billy-conversation-search"
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search conversations"
            autoComplete="off"
            className="w-full rounded-xl border border-zinc-800/80 bg-zinc-900/60 py-2 pr-3 pl-9 text-sm text-zinc-100 placeholder:text-zinc-400 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-silver/60"
          />
        </div>
      </div>
      <nav
        aria-label="Conversations"
        ref={historyNavRef}
        tabIndex={-1}
        className="flex-1 overflow-y-auto px-3 pt-5 pb-3"
      >
        {conversationsSection ?? (
          <p className="px-2 py-6 text-center text-sm text-zinc-400">
            No conversations yet.
          </p>
        )}
      </nav>
      <SidebarFooter authed={authed} />
    </div>
  );
}

function MobileDrawer({
  onCloseMobile,
  onNewChat,
  conversationsSection,
  searchQuery,
  onSearchChange,
  authed,
}: {
  readonly onCloseMobile: () => void;
  readonly onNewChat: () => void;
  readonly conversationsSection?: ReactNode | undefined;
  readonly searchQuery: string;
  readonly onSearchChange: (value: string) => void;
  readonly authed?: boolean | undefined;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    // The drawer is modal on mobile: keep Tab / Shift+Tab inside it so the
    // obscured page behind the backdrop is never keyboard-reachable. Focus
    // is moved in on open and returned to the trigger by the parent on
    // close, so there is no trap once the drawer unmounts.
    function isTabbable(element: Element): boolean {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hasAttribute("disabled")) return false;
      return element.tabIndex >= 0 || element.matches(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseMobile();
        return;
      }
      if (event.key !== "Tab" || panel === null) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]"),
      ).filter(isTabbable);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    panel?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCloseMobile]);

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close sidebar"
        onClick={onCloseMobile}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        aria-label="BILLY sidebar"
        aria-modal="true"
        role="dialog"
        className="absolute inset-y-0 left-0 w-72 max-w-[85vw] focus:outline-none"
      >
        <SidebarBody
          onNewChat={onNewChat}
          conversationsSection={conversationsSection}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          authed={authed}
          brandTrailing={
            <button
              type="button"
              onClick={onCloseMobile}
              title="Close sidebar"
              aria-label="Close sidebar"
              className="-my-3 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-silver"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          }
        />
      </aside>
    </div>
  );
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  onNewChat,
  conversationsSection,
  searchQuery,
  onSearchChange,
  authed,
  collapsed,
  onCollapse,
  collapseButtonRef,
  expandButtonRef,
  searchInputRef,
  historyNavRef,
  onExpand,
}: SidebarProps) {
  // Collapsing only toggles layout; conversations, model and composer state
  // sit with the parent and are untouched. Desktop swaps the panel for the
  // rail in the same element, so there is one sidebar, one panel id and no
  // gap or duplicate expand control beside the rail.
  return (
    <>
      <aside
        id="billy-sidebar"
        aria-label="BILLY sidebar"
        className={`hidden shrink-0 md:block ${collapsed ? "w-16" : "w-72"}`}
      >
        {collapsed ? (
          <SidebarRail
            authed={authed}
            onNewChat={onNewChat}
            onExpand={onExpand}
            expandButtonRef={expandButtonRef}
          />
        ) : (
          <SidebarBody
            onNewChat={onNewChat}
            conversationsSection={conversationsSection}
            searchQuery={searchQuery}
            onSearchChange={onSearchChange}
            authed={authed}
            onCollapse={onCollapse}
            collapseRef={collapseButtonRef}
            searchInputRef={searchInputRef}
            historyNavRef={historyNavRef}
          />
        )}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <MobileDrawer
          onCloseMobile={onCloseMobile}
          onNewChat={() => {
            onCloseMobile();
            onNewChat();
          }}
          conversationsSection={conversationsSection}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          authed={authed}
        />
      ) : null}
    </>
  );
}
