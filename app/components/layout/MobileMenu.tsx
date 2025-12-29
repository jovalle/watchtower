/**
 * Mobile navigation menu component.
 *
 * Full-screen overlay menu that slides in from the right,
 * with stacked navigation links and smooth animations.
 */

import { useEffect } from "react";
import { NavLink, Form } from "@remix-run/react";
import { X, LogOut, User } from "lucide-react";
import type { PlexUser } from "~/lib/auth/plex.server";

interface NavItem {
  label: string;
  to: string;
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavItem[];
  user: PlexUser;
}

export function MobileMenu({ isOpen, onClose, navItems, user }: MobileMenuProps) {
  // Close on escape key and manage body scroll
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when menu is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu panel - slides in from right */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-72 bg-background-primary shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header with close button */}
        <div className="flex h-16 items-center justify-end border-b border-border-subtle px-4">
          <button
            onClick={onClose}
            className="rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary"
            aria-label="Close menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation links - stacked vertically */}
        <nav className="flex flex-col gap-2 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              onClick={onClose}
              className={({ isActive }) =>
                `rounded-md px-4 py-3 text-base font-medium transition-colors duration-200 ${
                  isActive
                    ? "bg-background-elevated text-foreground-primary"
                    : "text-foreground-secondary hover:bg-background-elevated hover:text-foreground-primary"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section at bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-border-subtle p-4">
          {/* User info */}
          <div className="mb-3 flex items-center gap-3">
            {user.thumb ? (
              <img
                src={user.thumb}
                alt={user.username}
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-elevated">
                <User className="h-5 w-5 text-foreground-secondary" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-foreground-primary">
                {user.title || user.username}
              </p>
              {user.email && (
                <p className="text-xs text-foreground-muted">{user.email}</p>
              )}
            </div>
          </div>

          {/* Log Out button */}
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-md bg-background-elevated px-4 py-2.5 text-sm font-medium text-foreground-secondary transition-colors hover:bg-background-primary hover:text-foreground-primary"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </Form>
        </div>
      </div>
    </>
  );
}
