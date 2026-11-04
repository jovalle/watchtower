import { useState, useRef, useEffect } from "react";
import { Form, Link } from "@remix-run/react";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import type { PlexUser } from "~/lib/auth/plex.server";
import { buttonStyles } from "~/components/ui/Button";

interface UserMenuProps {
  user: PlexUser;
}

/**
 * User menu with dropdown displaying profile and logout options.
 */
export function UserMenu({ user }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        triggerRef.current?.focus();
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
    <div className="relative" ref={menuRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account Menu"
        onClick={() => setIsOpen(!isOpen)}
        className={buttonStyles({ variant: "ghost", size: "sm", className: "gap-2 px-2" })}
        aria-expanded={isOpen}
      >
        {user.thumb ? (
          <img
            src={user.thumb}
            alt=""
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
        className={`absolute right-0 top-full z-50 mt-2 max-h-[calc(100dvh_-_var(--app-header-offset)_-_1rem)] w-56 max-w-[calc(100vw-2rem)] origin-top-right overflow-y-auto rounded-md bg-background-elevated shadow-lg ring-1 ring-border-subtle transition-all duration-200 ${
          isOpen
            ? "scale-100 opacity-100"
            : "pointer-events-none scale-95 opacity-0"
        }`}
        hidden={!isOpen}
      >
        {/* User info */}
        <div className="border-b border-border-subtle px-4 py-3">
          <p title={user.title || user.username} className="truncate text-sm font-medium text-foreground-primary">
            {user.title || user.username}
          </p>
          {user.email && (
            <p title={user.email} className="truncate text-xs text-foreground-muted">{user.email}</p>
          )}
        </div>

        {/* Menu items */}
        <div className="py-1">
          {[
            ["Requests", "/app/requests"],
            ["Issues", "/app/issues"],
          ].map(([label, to]) => (
            <Link
              key={to}
              to={to}
              onClick={() => setIsOpen(false)}
              className={buttonStyles({ variant: "ghost", size: "sm", className: "w-full !justify-start gap-3 !text-foreground-secondary" })}
            >
              {label}
            </Link>
          ))}
          <Link
            to="/app/settings"
            className={buttonStyles({ variant: "ghost", size: "sm", className: "w-full !justify-start gap-3 !text-foreground-secondary" })}
            onClick={() => setIsOpen(false)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className={buttonStyles({ variant: "ghost", size: "sm", className: "w-full !justify-start gap-3 !text-foreground-secondary" })}
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
