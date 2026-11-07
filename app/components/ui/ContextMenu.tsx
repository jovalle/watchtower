import { useEffect, useRef, type ReactNode } from "react";
import { buttonStyles } from "./Button";

export interface ContextMenuItem {
  /** Display label for the menu item */
  label: string;
  /** Optional icon to display before the label */
  icon?: ReactNode;
  /** Handler called when item is clicked */
  onClick: () => void;
  /** If true, displays in destructive (red) style */
  destructive?: boolean;
  /** If true, the item is disabled */
  disabled?: boolean;
}

interface ContextMenuProps {
  /** Menu items to display */
  items: ContextMenuItem[];
  /** Position to display the menu (cursor position) */
  position: { x: number; y: number };
  /** Handler called when menu should close */
  onClose: () => void;
}

/**
 * Context menu component that appears on right-click.
 *
 * Features:
 * - Appears at cursor position
 * - Closes on click outside or Escape key
 * - Dark theme matching Netflix style
 * - Smooth fade-in animation
 */
export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    (menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? menuRef.current)?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use mousedown to close before the click event fires elsewhere
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;

      // Adjust if menu would overflow right edge
      if (rect.right > window.innerWidth - padding) {
        menuRef.current.style.left = `${window.innerWidth - rect.width - padding}px`;
      }

      // Adjust if menu would overflow bottom edge
      if (rect.bottom > window.innerHeight - padding) {
        menuRef.current.style.top = `${window.innerHeight - rect.height - padding}px`;
      }
    }
  }, [position]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    onClose();
  };

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      aria-label="Media Actions"
      onKeyDown={(event) => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        let next = index;
        if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
        else if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = buttons.length - 1;
        else if (event.key === "Tab") { onClose(); return; }
        else return;
        event.preventDefault();
        buttons[next]?.focus();
      }}
      className="fixed z-50 min-w-[160px] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] animate-fadeIn overflow-y-auto rounded-lg border border-border-emphasis bg-background-elevated py-1 shadow-xl"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          type="button"
          role="menuitem"
          onClick={() => handleItemClick(item)}
          disabled={item.disabled}
          className={buttonStyles({ variant: "ghost", size: "sm", className: `w-full !justify-start gap-2 text-left ${
            item.disabled
              ? "cursor-not-allowed !text-foreground-muted"
              : item.destructive
                ? "!text-red-400 hover:!bg-red-500/20"
                : "text-foreground-primary"
          }` })}
        >
          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
          <span className="min-w-0 break-words">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
