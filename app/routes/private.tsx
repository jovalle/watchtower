/**
 * Vote layout route — /vote/*
 *
 * Optional authentication: tries to resolve the Plex user but does NOT
 * redirect unauthenticated visitors. Guests can view showings and vote.
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Form,
  Link,
  Outlet,
  useLoaderData,
  useFetcher,
  useLocation,
} from "@remix-run/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Container } from "~/components/layout";
import { usePageScrollLock } from "~/hooks/usePageScrollLock";
import { Logo, buttonStyles } from "~/components/ui";
import { getPlexToken, getSession } from "~/lib/auth/session.server";
import { getPlexUser, type PlexUser } from "~/lib/auth/plex.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Private Cinema - Watchtower" },
    { name: "description", content: "Browse and host private movie nights" },
  ];
};

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
  const createDialogRef = useRef<HTMLDialogElement>(null);
  usePageScrollLock(showForm);
  useEffect(() => {
    if (!showForm) return;
    const dialog = createDialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [showForm]);
  const [newName, setNewName] = useState("");
  const [formError, setFormError] = useState("");
  const createFetcher = useFetcher<{
    success?: boolean;
    showing?: { id: string };
    error?: string;
  }>();
  const location = useLocation();
  const isOnDashboard =
    location.pathname === "/private" || location.pathname === "/private/";
  const loginHref = `/auth/redirect?redirectTo=${encodeURIComponent(
    `${location.pathname}${location.search}`
  )}`;

  // Surface server errors from the fetcher
  useEffect(() => {
    if (createFetcher.data?.error) {
      setFormError(createFetcher.data.error);
      setShowForm(true);
    }
  }, [createFetcher.data]);

  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.success) {
      setNewName("");
      setShowForm(false);
    }
  }, [createFetcher.state, createFetcher.data]);

  const handleCreate = useCallback(() => {
    if (createFetcher.state !== "idle") return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed.length < 3) {
      setFormError("Name must be at least 3 characters");
      return;
    }
    setFormError("");
    createFetcher.submit(JSON.stringify({ name: trimmed }), {
      method: "POST",
      action: "/api/vote/showings",
      encType: "application/json",
    });
  }, [newName, createFetcher]);

  return (
    <div className="min-h-screen bg-background-primary overflow-x-hidden">
      {/* Minimal header */}
      <header className="sticky top-0 z-40 pt-safe shadow-[inset_0_-1px_var(--color-border-subtle)] bg-background-primary/80 backdrop-blur-xl">
        <Container size="wide" className="flex h-[var(--app-header-height)] items-center justify-between">
          <div className="flex items-center shrink-0">
            <Link to="/private" className="flex min-h-11 items-center">
              <Logo />
            </Link>
          </div>

          {/* Centered title */}
          <Link
            to="/private"
            className="flex-1 text-center text-sm sm:text-xl font-black text-amber-50 tracking-widest hover:text-amber-300 transition-colors truncate mx-2"
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
                loginHref={loginHref}
                onLogout={clearGuestIdentity}
              />
            ) : (
              <Link
                to={loginHref}
                className="text-sm text-accent-primary hover:underline"
              >
                Sign In
              </Link>
            )}
          </div>
        </Container>
      </header>

      {/* Inline create form — slides down from navbar */}

      <Container size="wide" className="py-8"><main className="mx-auto min-w-0 max-w-5xl">
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
      </main></Container>

      {/* Floating action button + popover modal */}
      {user && isOnDashboard && (
        <>
          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
            {showForm && (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <dialog
                ref={createDialogRef}
                onCancel={(event) => { if (createFetcher.state !== "idle") event.preventDefault(); else setShowForm(false); }}
                className="fixed bottom-24 left-auto right-6 top-auto m-0 max-h-[calc(100dvh-7rem)] w-72 max-w-[calc(100vw-3rem)] overflow-y-auto rounded-xl border border-border-emphasis bg-background-elevated p-4 text-foreground-primary shadow-2xl backdrop:bg-black/50"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="Create Showing"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <input
                      aria-label="Showing Name"
                      disabled={createFetcher.state !== "idle"}
                      type="text"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        if (formError) setFormError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreate();
                        if (e.key === "Escape") {
                          setShowForm(false);
                          setNewName("");
                          setFormError("");
                        }
                      }}
                      placeholder='e.g. "Friday Night Flicks"'
                      maxLength={60}
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className={`flex-1 min-w-0 rounded-lg border bg-black/50 px-3 py-2.5 text-sm text-amber-50 placeholder:text-amber-200/30 focus:outline-none focus:ring-1 transition-colors ${
                        formError
                          ? "border-red-500/60 focus:border-red-400 focus:ring-red-400"
                          : "border-amber-500/30 focus:border-amber-400 focus:ring-amber-400"
                      }`}
                    />
                    <button
                      onClick={handleCreate}
                      disabled={createFetcher.state !== "idle" || newName.trim().length < 3}
                      className={buttonStyles({ size: "sm", className: "shrink-0" })}
                      aria-label="Create Showing"
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
                  {formError && (
                    <p role="alert" className="text-sm text-red-300 px-1">{formError}</p>
                  )}
                </div>
                {createFetcher.data?.error && !formError && <p role="alert" className="mt-3 text-sm text-red-300">{createFetcher.data.error}</p>}
                {createFetcher.state !== "idle" && <p role="status" className="mt-3 text-sm text-foreground-secondary">Creating Showing...</p>}
                <button type="button" disabled={createFetcher.state !== "idle"} onClick={() => setShowForm(false)} className={buttonStyles({ variant: "ghost", size: "sm", className: "mt-3 w-full" })}>Cancel</button>
              </dialog>
            )}
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg shadow-amber-500/25 hover:bg-amber-400 active:scale-95 transition-all"
              aria-expanded={showForm}
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onEscape); };
  }, [open]);

  return (
    <div className="relative" ref={menuRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account Menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={buttonStyles({ variant: "ghost", size: "sm", className: "gap-2 px-2" })}
      >
        {user.thumb ? (
          <img src={user.thumb} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-foreground">
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="hidden max-w-28 truncate sm:inline text-sm font-medium text-foreground-secondary">
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
        <div className="absolute right-0 mt-1 w-44 max-w-[calc(100vw-3rem)] rounded-lg border border-white/10 bg-background-primary py-1 shadow-xl">
          <Link
            to="/app"
            className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
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
          <Form method="post" action="/auth/logout"><button type="submit"
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
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
            Sign Out
          </button></Form>
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
  loginHref,
  onLogout,
}: {
  guestName: string;
  loginHref: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onEscape);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", onEscape); };
  }, [open]);

  const initial = guestName.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account Menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={buttonStyles({ variant: "ghost", size: "sm", className: "gap-2 px-2" })}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-foreground">
          {initial}
        </div>
        <span className="hidden max-w-28 truncate sm:inline text-sm font-medium text-foreground-secondary">
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
        <div className="absolute right-0 mt-1 w-44 max-w-[calc(100vw-3rem)] rounded-lg border border-white/10 bg-background-primary py-1 shadow-xl">
          <Link
            to={loginHref}
            className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
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
            Sign In with Plex
          </Link>
          <button
            onClick={() => {
              onLogout();
              setOpen(false);
            }}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-sm text-foreground-secondary hover:bg-white/5 hover:text-foreground-primary transition-colors"
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
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}

export type { VoteContext };
