/**
 * Mobile navigation menu component.
 *
 * Full-screen overlay menu that slides in from the right,
 * with stacked navigation links and smooth animations.
 */

import { usePageScrollLock } from "~/hooks/usePageScrollLock";
import { useEffect, useRef } from "react";
import { NavLink, Form, useLocation } from "@remix-run/react";
import { X, LogOut, User, Activity } from "lucide-react";
import type { PlexUser } from "~/lib/auth/plex.server";
import { buttonStyles } from "~/components/ui/Button";

interface NavItem {
  label: string;
  to: string;
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenActivity: () => void;
  navItems: NavItem[];
  user: PlexUser;
}

export function MobileMenu({
  isOpen,
  onClose,
  onOpenActivity,
  navItems,
  user,
}: MobileMenuProps) {
  const { pathname } = useLocation();
  usePageScrollLock(isOpen);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [isOpen]);

  return (
    <>
      <dialog
        ref={dialogRef}
        onCancel={onClose}
        className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-72 max-w-full border-0 bg-background-primary p-0 text-foreground-primary shadow-xl backdrop:bg-black/60"
        aria-label="Navigation Menu"
      >
        <div className="flex h-full flex-col">
        {/* Header with close button */}
        <div className="flex h-[var(--app-header-offset)] shrink-0 items-center justify-end pt-safe border-b border-border-subtle px-4">
          <button
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary"
            aria-label="Close Menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation links - stacked vertically */}
        <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
          {[
            ...navItems,
            { label: "Notifications", to: "/app/notifications" },
            { label: "Requests", to: "/app/requests" },
            { label: "Issues", to: "/app/issues" },
            { label: "Settings", to: "/app/settings" },
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app"}
              onClick={onClose}
              className={({ isActive }) =>
                `rounded-md px-4 py-3 text-base font-medium transition-colors duration-200 ${
                  isActive || (item.to === "/app/stuff" && pathname.startsWith("/app/lists/"))
                    ? "bg-background-elevated text-foreground-primary"
                    : "text-foreground-secondary hover:bg-background-elevated hover:text-foreground-primary"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button type="button" onClick={onOpenActivity} className="flex min-h-11 items-center gap-2 rounded-md px-4 py-3 text-left text-base font-medium text-foreground-secondary hover:bg-background-elevated hover:text-foreground-primary">
            <Activity className="h-5 w-5" aria-hidden="true" />
            Streaming Activity
          </button>
        </nav>

        {/* User section at bottom */}
        <div className="shrink-0 border-t border-border-subtle p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {/* User info */}
          <div className="mb-3 flex items-center gap-3">
            {user.thumb ? (
              <img
                src={user.thumb}
                alt={user.username}
                className="h-10 w-10 shrink-0 rounded-full"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background-elevated">
                <User className="h-5 w-5 text-foreground-secondary" />
              </div>
            )}
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-foreground-primary">
                {user.title || user.username}
              </p>
              {user.email && (
                <p className="truncate text-xs text-foreground-muted">{user.email}</p>
              )}
            </div>
          </div>

          {/* Log Out button */}
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className={buttonStyles({ variant: "secondary", size: "sm", className: "w-full gap-2" })}
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </Form>
        </div>
        </div>
      </dialog>
    </>
  );
}
