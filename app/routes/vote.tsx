/**
 * Vote layout route — /vote/*
 *
 * Optional authentication: tries to resolve the Plex user but does NOT
 * redirect unauthenticated visitors. Guests can view showings and vote.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  Outlet,
  useLoaderData,
  useFetcher,
  useLocation,
  useNavigate,
} from "@remix-run/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { getPlexToken, getSession } from "~/lib/auth/session.server";
import { getPlexUser, type PlexUser } from "~/lib/auth/plex.server";

interface VoteContext {
  user: PlexUser | null;
  isOwner: boolean;
  guestName: string;
  guestToken: string;
  setGuestIdentity: (name: string, token: string) => void;
  clearGuestIdentity: () => void;
}

export async function loader({ request }: LoaderFunctionArgs) {
  let user: PlexUser | null = null;
  let isOwner = false;

  const token = await getPlexToken(request);
  if (token) {
    user = await getPlexUser(token);
    const session = await getSession(request);
    isOwner = session.get("isOwner") === true;
  }

  return json({ user, isOwner });
}

export default function VoteLayout() {
  const { user, isOwner } = useLoaderData<typeof loader>();

  // Lift guest identity state to layout
  const [guestName, setGuestNameState] = useState("");
  const [guestToken, setGuestTokenState] = useState("");

  useEffect(() => {
    const storedName = localStorage.getItem("watchtower-guest-name");
    const storedToken = localStorage.getItem("watchtower-guest-token");
    if (storedName) setGuestNameState(storedName);
    if (storedToken) setGuestTokenState(storedToken);
  }, []);

  const setGuestIdentity = useCallback((name: string, token: string) => {
    setGuestNameState(name);
    setGuestTokenState(token);
    localStorage.setItem("watchtower-guest-name", name);
    localStorage.setItem("watchtower-guest-token", token);
  }, []);

  const clearGuestIdentity = useCallback(() => {
    const token = localStorage.getItem("watchtower-guest-token");
    if (token) {
      // Fire-and-forget release
      fetch("/api/vote/guest", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {
        /* best effort */
      });
    }
    setGuestNameState("");
    setGuestTokenState("");
    localStorage.removeItem("watchtower-guest-name");
    localStorage.removeItem("watchtower-guest-token");
  }, []);

  // New Showing form state (in navbar)
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const createFetcher = useFetcher<{
    success?: boolean;
    showing?: { id: string };
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isOnDashboard =
    location.pathname === "/vote" || location.pathname === "/vote/";

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createFetcher.submit(JSON.stringify({ name: newName.trim() }), {
      method: "POST",
      action: "/api/vote/showings",
      encType: "application/json",
    });
    setNewName("");
    setShowForm(false);
  }, [newName, createFetcher]);

  // Redirect to the new showing page after creation
  useEffect(() => {
    if (createFetcher.data?.success && createFetcher.data.showing?.id) {
      navigate(`/private/${createFetcher.data.showing.id}`);
    }
  }, [createFetcher.data, navigate]);

  return (
    <div className="min-h-screen bg-background-primary overflow-x-hidden">
      {/* Minimal header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-background-primary/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center shrink-0">
            <Link to="/vote" className="flex items-center">
              <img src="/logo.png" alt="Watchtower" className="h-7 w-auto" />
            </Link>
          </div>

          {/* Centered title */}
          <Link
            to="/vote"
            className="flex-1 text-center text-sm sm:text-xl font-black text-amber-50 tracking-widest uppercase hover:text-amber-300 transition-colors truncate mx-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Private Cinema
          </Link>

          <div className="flex items-center shrink-0">
            {user ? (
              <AuthUserMenu user={user} />
            ) : guestName ? (
              <GuestUserMenu
                guestName={guestName}
                onLogout={clearGuestIdentity}
              />
            ) : (
              <Link
                to="/auth/redirect"
                className="text-sm text-accent-primary hover:underline"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Inline create form — slides down from navbar */}

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet
          context={
            {
              user,
              isOwner,
              guestName,
              guestToken,
              setGuestIdentity,
              clearGuestIdentity,
            } satisfies VoteContext
          }
        />
      </main>

      {/* Floating action button + popover modal */}
      {user && isOnDashboard && (
        <>
          {showForm && (
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setShowForm(false);
                setNewName("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowForm(false);
                  setNewName("");
                }
              }}
              role="presentation"
            />
          )}
          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
            {showForm && (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <div
                className="animate-popUp w-72 rounded-xl border border-amber-500/30 bg-background-primary/95 backdrop-blur-xl p-4 shadow-2xl shadow-amber-500/10"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Create showing"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") {
                        setShowForm(false);
                        setNewName("");
                      }
                    }}
                    placeholder='e.g. "Friday Night Flicks"'
                    maxLength={60}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="flex-1 min-w-0 rounded-lg border border-amber-500/30 bg-black/50 px-3 py-2.5 text-sm text-amber-50 placeholder:text-amber-200/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="Create showing"
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/25 hover:bg-amber-400 active:scale-95 transition-all"
              aria-label="New Showing"
            >
              <svg
                className={`h-7 w-7 transition-transform duration-200 ${
                  showForm ? "rotate-45" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Authenticated user avatar + dropdown menu in the header.
 */
function AuthUserMenu({ user }: { user: PlexUser }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5 transition-colors"
      >
        {user.thumb ? (
          <img src={user.thumb} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-foreground">
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden sm:inline text-sm font-medium text-foreground-secondary">
          {user.username}
        </span>
        <svg
          className="h-3.5 w-3.5 text-foreground-muted hidden sm:block"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-lg border border-white/10 bg-background-primary py-1 shadow-xl">
          <Link
            to="/app"
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
              />
            </svg>
            Back to App
          </Link>
          <Link
            to="/auth/logout"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
              />
            </svg>
            Sign out
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Guest user avatar + dropdown menu in the header.
 */
function GuestUserMenu({
  guestName,
  onLogout,
}: {
  guestName: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initial = guestName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-white/5 transition-colors"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-foreground">
          {initial}
        </div>
        <span className="hidden sm:inline text-sm font-medium text-foreground-secondary">
          {guestName}
        </span>
        <svg
          className="h-3.5 w-3.5 text-foreground-muted hidden sm:block"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m19.5 8.25-7.5 7.5-7.5-7.5"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-lg border border-white/10 bg-background-primary py-1 shadow-xl">
          <Link
            to="/auth/redirect"
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
            onClick={() => setOpen(false)}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
              />
            </svg>
            Sign in with Plex
          </Link>
          <button
            onClick={() => {
              onLogout();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
              />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export type { VoteContext };
