import { useState, useRef, useEffect } from "react";
import { Form, Link } from "@remix-run/react";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import type { PlexUser } from "~/lib/auth/plex.server";

interface UserMenuProps {
  user: PlexUser;
}

/**
 * User menu with dropdown displaying profile and logout options.
 */
export function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-background-elevated"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.thumb ? (
          <img
            src={user.thumb}
            alt={user.username}
            className="h-8 w-8 rounded-full"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background-elevated">
            <User className="h-4 w-4 text-foreground-secondary" />
          </div>
        )}
        <ChevronDown
          className={`h-4 w-4 text-foreground-secondary transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown menu */}
      <div
        className={`absolute right-0 top-full mt-2 w-48 origin-top-right rounded-md bg-background-elevated shadow-lg ring-1 ring-border-subtle transition-all duration-200 ${
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
        role="menu"
      >
        {/* User info */}
        <div className="border-b border-border-subtle px-4 py-3">
          <p className="text-sm font-medium text-foreground-primary">
            {user.title || user.username}
          </p>
          {user.email && (
            <p className="text-xs text-foreground-muted">{user.email}</p>
          )}
        </div>

        {/* Menu items */}
        <div className="py-1">
          <Link
            to="/app/settings"
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground-secondary transition-colors hover:bg-background-primary hover:text-foreground-primary"
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-foreground-secondary transition-colors hover:bg-background-primary hover:text-foreground-primary"
              role="menuitem"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
