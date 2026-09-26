/**
 * Header component with Netflix-style navigation.
 *
 * Fixed position header with scroll-based background transition,
 * navigation links, and user menu integration.
 */

import { useState, useEffect, useCallback } from "react";
import { NavLink, Link, useNavigate, useFetcher, useLocation } from "@remix-run/react";
import { Bell, Menu, Search } from "lucide-react";
import { UserMenu } from "~/components/UserMenu";
import { StreamingDashboard } from "~/components/StreamingDashboard";
import { Logo } from "~/components/ui";
import { Container } from "./Container";
import { MobileMenu } from "./MobileMenu";
import type { PlexUser } from "~/lib/auth/plex.server";
import { saveClientPlaybackCaps } from "~/lib/playback-caps";

interface HeaderProps {
  user: PlexUser;
  discoveryDisabled?: boolean;
}

interface NavItem {
  label: string;
  to: string;
}

const navItems: NavItem[] = [
  { label: "Watch", to: "/app/watch" },
  { label: "Discover", to: "/app/discover" },
  { label: "My Stuff", to: "/app/stuff" },
];

/**
 * Navigation link with active state styling.
 */
function NavLinkItem({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  return (
    <NavLink
      to={item.to}
      end={item.to === "/app"}
      className={({ isActive }) =>
        `flex min-h-11 items-center text-sm font-medium transition-colors duration-200 ${
          isActive || (item.to === "/app/stuff" && pathname.startsWith("/app/lists/"))
            ? "text-foreground-primary"
            : "text-foreground-secondary hover:text-foreground-primary"
        }`
      }
    >
      {item.label}
    </NavLink>
  );
}

export function Header({ user, discoveryDisabled = false }: HeaderProps) {
  const items = discoveryDisabled ? navItems.filter((item) => item.to !== "/app/discover") : navItems;
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const inbox = useFetcher<{ unread: number }>();
  const loadInbox = inbox.load;
  useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible") loadInbox("/api/notifications"); };
    poll();
    const timer = setInterval(poll, 60000);
    document.addEventListener("visibilitychange", poll);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [loadInbox]);

  // Throttled scroll handler
  const handleScroll = useCallback(() => {
    const scrolled = window.scrollY > 10;
    setIsScrolled(scrolled);
  }, []);

  useEffect(() => {
    // Check initial scroll position
    handleScroll();

    // Throttle scroll events for performance
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [handleScroll]);

  const toggleMobileMenu = () => setIsMobileMenuOpen((prev) => !prev);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const navigate = useNavigate();
  // Header is on every app page, so this runs before the first playback loader.
  useEffect(() => saveClientPlaybackCaps(), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        navigate("/app/search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <>
      <header
        className={`fixed left-0 right-0 top-0 z-50 h-16 transition-colors duration-300 ${
          isScrolled
            ? "bg-background-primary/95 backdrop-blur-sm"
            : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
      >
        <Container size="wide">
          <div className="flex h-16 items-center justify-between">
            {/* Left section: Logo + Navigation */}
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/app" aria-label="Watchtower home" className="flex items-center">
                <Logo />
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden items-center gap-6 md:flex">
                {items.map((item) => (
                  <NavLinkItem key={item.to} item={item} />
                ))}
              </nav>
            </div>

            {/* Right section: Actions + User Menu */}
            <div className="flex items-center gap-4">
              <Link to="/app/notifications" aria-label={`Notifications${inbox.data?.unread ? `, ${inbox.data.unread} unread` : ""}`} className="relative flex h-11 w-11 items-center justify-center rounded-md text-foreground-secondary hover:bg-background-elevated">
                <Bell className="h-5 w-5" />
                {!!inbox.data?.unread && <span className="absolute right-0 top-0 rounded-full bg-accent-primary px-1.5 text-xs text-background-primary">{inbox.data.unread}</span>}
              </Link>
              <Link
                to="/app/search"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary"
                aria-label="Search"
                title="Search (⌘K)"
              >
                <Search className="h-5 w-5" />
              </Link>

              {/* Streaming Dashboard */}
              <StreamingDashboard />

              {/* User Menu - visible on all sizes */}
              <div className="hidden sm:block">
                <UserMenu user={user} />
              </div>

              {/* Mobile: Compact user avatar */}
              <div className="flex items-center gap-2 sm:hidden">
                {user.thumb && (
                  <img
                    src={user.thumb}
                    alt={user.username}
                    className="h-8 w-8 rounded-full"
                  />
                )}
              </div>

              {/* Mobile hamburger menu */}
              <button
                onClick={toggleMobileMenu}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary md:hidden"
                aria-label="Open menu"
                aria-expanded={isMobileMenuOpen}
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>
          </div>
        </Container>
      </header>

      {/* Mobile Menu */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
        navItems={items}
        user={user}
      />
    </>
  );
}
