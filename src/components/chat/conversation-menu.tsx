"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export interface ConversationMenuItem {
  readonly key: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly destructive?: boolean | undefined;
}

interface ConversationMenuProps {
  /** Accessible name for the trigger, e.g. "Actions for Trip planning". */
  readonly label: string;
  readonly items: readonly ConversationMenuItem[];
  readonly disabled?: boolean | undefined;
  /** Trigger styling, so rows and the header each keep their own rhythm. */
  readonly triggerClassName?: string | undefined;
}

const MENU_WIDTH_PX = 176;
const ITEM_HEIGHT_PX = 36;
const GAP_PX = 4;

/**
 * Overflow menu for conversation actions.
 *
 * Fixed positioning with measured coordinates: the sidebar list scrolls
 * inside an overflow container, where an absolutely positioned menu would
 * be clipped mid-list. Rendered on demand so the popup never sits in the
 * DOM while closed.
 */
export function ConversationMenu({
  label,
  items,
  disabled,
  triggerClassName,
}: ConversationMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function close(returnFocus: boolean) {
    setOpen(false);
    setPosition(null);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const trigger = triggerRef.current;
    if (trigger === null) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const height = items.length * ITEM_HEIGHT_PX + 8;
    const below = rect.bottom + GAP_PX;
    setPosition({
      top:
        below + height > window.innerHeight
          ? Math.max(GAP_PX, rect.top - GAP_PX - height)
          : below,
      left: Math.max(
        GAP_PX,
        Math.min(rect.right - MENU_WIDTH_PX, window.innerWidth - MENU_WIDTH_PX - GAP_PX),
      ),
    });
  }, [open, items.length]);

  // Focus the first item once the popup exists: it is rendered only after
  // its position is measured, so this cannot live in the effect above.
  useEffect(() => {
    if (position === null) {
      return;
    }
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [position]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target === null) {
        return;
      }
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      close(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close(true);
      }
    }
    // The popup is positioned in viewport coordinates, so it cannot follow
    // the trigger when the page or the list moves: close instead of drift.
    // A resize without a size change moves nothing, so it is ignored.
    const openedWidth = window.innerWidth;
    const openedHeight = window.innerHeight;
    function handleViewportChange() {
      close(false);
    }
    function handleResize() {
      if (window.innerWidth !== openedWidth || window.innerHeight !== openedHeight) {
        close(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    if (buttons.length === 0) {
      return;
    }
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close(true) : setOpen(true))}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={triggerClassName}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {open && position !== null ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          style={{ top: position.top, left: position.left, width: MENU_WIDTH_PX }}
          className="fixed z-50 flex flex-col rounded-xl border border-hairline bg-white py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                // Focus the trigger first so the browser restores focus
                // there when a dialog opened from this item closes.
                close(true);
                item.onSelect();
              }}
              className={`px-3 py-2 text-left text-sm transition-colors hover:bg-wash focus-visible:bg-wash focus-visible:outline-none ${
                item.destructive ? "text-red-600" : "text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
