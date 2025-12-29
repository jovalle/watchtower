import { useEffect, useRef, type ReactNode } from "react";

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
      className="fixed z-50 min-w-[160px] animate-fadeIn overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => handleItemClick(item)}
          disabled={item.disabled}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            item.disabled
              ? "cursor-not-allowed text-zinc-500"
              : item.destructive
                ? "text-red-400 hover:bg-red-500/20"
                : "text-white hover:bg-zinc-800"
          }`}
        >
          {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
